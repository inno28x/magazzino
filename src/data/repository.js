// UNICO punto di accesso al database. Le schermate non importano mai
// Supabase direttamente: per cambiare backend si riscrive solo questo file.

import { supabase } from './supabase.js';
import { traduciErrore } from './errori.js';

/** @typedef {import('./tipi.js').Profilo} Profilo */
/** @typedef {import('./tipi.js').Cliente} Cliente */
/** @typedef {import('./tipi.js').Articolo} Articolo */
/** @typedef {import('./tipi.js').Movimento} Movimento */
/** @typedef {import('./tipi.js').BozzaMovimento} BozzaMovimento */
/** @typedef {import('./tipi.js').VoceAudit} VoceAudit */
/** @typedef {import('./tipi.js').Impostazioni} Impostazioni */

function risultato({ data, error }) {
  if (error) throw traduciErrore(error);
  return data;
}

async function esegui(promessa) {
  try {
    return risultato(await promessa);
  } catch (e) {
    throw traduciErrore(e);
  }
}

// --------------------------------------------------------------- sessione

export async function accedi(email, password) {
  return esegui(supabase.auth.signInWithPassword({ email: email.trim(), password }));
}

export async function esci() {
  return esegui(supabase.auth.signOut());
}

/** @returns {Promise<import('@supabase/supabase-js').Session | null>} */
export async function sessioneCorrente() {
  const dati = await esegui(supabase.auth.getSession());
  return dati.session;
}

/**
 * Avvisa a ogni cambio di sessione. Il callback riceve (evento, sessione);
 * evento "PASSWORD_RECOVERY" = l'utente arriva dal link di reset password.
 * @returns {() => void} funzione per smettere di ascoltare
 */
export function suCambioSessione(callback) {
  const { data } = supabase.auth.onAuthStateChange((evento, sessione) => callback(evento, sessione));
  return () => data.subscription.unsubscribe();
}

export async function inviaResetPassword(email) {
  return esegui(supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  }));
}

export async function impostaPassword(password) {
  return esegui(supabase.auth.updateUser({ password }));
}

/** @returns {Promise<Profilo | null>} */
export async function caricaProfilo(id) {
  return esegui(supabase.from('profili').select('id, email, nome, ruolo, attivo').eq('id', id).maybeSingle());
}

/** Nomi di tutti gli utenti, per lo storico modifiche. @returns {Promise<Map<string, string>>} */
export async function caricaNomiUtenti() {
  const righe = await esegui(supabase.from('profili').select('id, nome'));
  return new Map(righe.map((p) => [p.id, p.nome]));
}

// --------------------------------------------------------------- anagrafiche

/** @returns {Promise<Cliente[]>} */
export async function caricaClienti() {
  return esegui(
    supabase.from('clienti')
      .select('codice, ragione_sociale, struttura, zona, attivo, gruppo:gruppi(id, nome)')
      .order('struttura')
      .range(0, 9999),
  );
}

/** @returns {Promise<Articolo[]>} */
export async function caricaArticoli() {
  return esegui(
    supabase.from('articoli')
      .select('codice, descrizione, categoria, rfid, codice_base, attivo')
      .order('codice')
      .range(0, 9999),
  );
}

/** @returns {Promise<Impostazioni>} */
export async function caricaImpostazioni() {
  return esegui(supabase.from('impostazioni').select('*').eq('id', 1).single());
}

// --------------------------------------------------------------- movimenti

const CAMPI_MOVIMENTO = `
  id, data, direzione, causale, cliente_codice, richiesto_da, note, stato,
  motivo_annullamento, annullato_il, versione, created_at, updated_at, operatore_id,
  operatore:profili!movimenti_operatore_fkey(nome),
  modificato_da:profili!movimenti_updated_by_fkey(nome),
  annullato_da_profilo:profili!movimenti_annullato_da_fkey(nome),
  righe:movimento_righe(articolo_codice, quantita)
`;

/** Movimenti di un giorno, dal più recente. @returns {Promise<Movimento[]>} */
export async function movimentiDelGiorno(data) {
  return esegui(
    supabase.from('movimenti')
      .select(CAMPI_MOVIMENTO)
      .eq('data', data)
      .order('created_at', { ascending: false })
      .range(0, 9999),
  );
}

/** @returns {Promise<Movimento | null>} null se non esiste o non è visibile */
export async function caricaMovimento(id) {
  return esegui(supabase.from('movimenti').select(CAMPI_MOVIMENTO).eq('id', id).maybeSingle());
}

/**
 * Crea o modifica un movimento con le sue righe, in un colpo solo.
 * In modifica, se qualcuno l'ha cambiato nel frattempo, lancia un
 * ErroreApp con codice "MOVIMENTO_CAMBIATO" e non salva nulla.
 * @param {BozzaMovimento} bozza
 * @returns {Promise<{id: number, versione: number, data: string}>}
 */
export async function salvaMovimento(bozza) {
  const salvato = await esegui(supabase.rpc('salva_movimento', {
    p_id: bozza.id,
    p_versione: bozza.versione,
    p_testata: {
      data: bozza.data,
      direzione: bozza.direzione,
      causale: bozza.causale,
      cliente_codice: bozza.cliente_codice,
      richiesto_da: bozza.richiesto_da,
      note: bozza.note,
    },
    p_righe: bozza.righe.map((r) => ({ articolo_codice: r.articolo_codice, quantita: Number(r.quantita) })),
  }));
  return { id: salvato.id, versione: salvato.versione, data: salvato.data };
}

export async function annullaMovimento(id, versione, motivo) {
  return esegui(supabase.rpc('annulla_movimento', { p_id: id, p_versione: versione, p_motivo: motivo }));
}

export async function ripristinaMovimento(id, versione) {
  return esegui(supabase.rpc('ripristina_movimento', { p_id: id, p_versione: versione }));
}

/** Storico modifiche di un movimento, dal più vecchio. @returns {Promise<VoceAudit[]>} */
export async function storicoMovimento(id) {
  return esegui(
    supabase.from('audit_movimenti')
      .select('id, movimento_id, azione, utente_id, eseguito_il, prima, dopo')
      .eq('movimento_id', id)
      .order('eseguito_il'),
  );
}

// --------------------------------------------------------------- tempo reale

/**
 * Avvisa quando un movimento viene creato o cambiato da chiunque.
 * Il callback riceve la testata ({ id, data, versione, updated_by, stato, ... }),
 * senza righe: per i dettagli si usa caricaMovimento(id).
 * @returns {() => void} funzione per smettere di ascoltare
 */
export function ascoltaMovimenti(callback) {
  const canale = supabase
    .channel('movimenti')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movimenti' }, (evento) => {
      const testata = evento.new && Object.keys(evento.new).length ? evento.new : evento.old;
      if (testata?.id) callback(testata);
    })
    .subscribe();
  return () => {
    supabase.removeChannel(canale);
  };
}
