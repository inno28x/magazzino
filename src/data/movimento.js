// Regole sui movimenti, senza accesso al database: validazione del form,
// righe, totali, permessi di modifica, differenze per lo storico.
// Le stesse regole sono applicate anche dal database: qui servono per
// avvisare subito l'utente.

import { CAUSALI_PER_DIREZIONE } from './tipi.js';

/** @typedef {import('./tipi.js').BozzaMovimento} BozzaMovimento */
/** @typedef {import('./tipi.js').Movimento} Movimento */
/** @typedef {import('./tipi.js').RigaMovimento} RigaMovimento */
/** @typedef {import('./tipi.js').Profilo} Profilo */

/** @returns {BozzaMovimento} */
export function bozzaVuota(data, direzione = null) {
  return {
    id: null,
    versione: null,
    data,
    direzione,
    causale: null,
    cliente_codice: null,
    richiesto_da: '',
    note: '',
    righe: [],
  };
}

/** Bozza per modificare un movimento esistente. */
export function bozzaDaMovimento(/** @type {Movimento} */ mov) {
  return {
    id: mov.id,
    versione: mov.versione,
    data: mov.data,
    direzione: mov.direzione,
    causale: mov.causale,
    cliente_codice: mov.cliente_codice,
    richiesto_da: mov.richiesto_da ?? '',
    note: mov.note ?? '',
    righe: mov.righe.map((r) => ({ articolo_codice: r.articolo_codice, quantita: r.quantita })),
  };
}

/** Bozza nuova che copia un movimento precedente (richieste ricorrenti). */
export function bozzaDuplicata(/** @type {Movimento} */ mov, oggi) {
  return { ...bozzaDaMovimento(mov), id: null, versione: null, data: oggi };
}

/** Cambia direzione; la causale resta solo se è valida anche per la nuova. */
export function conDirezione(/** @type {BozzaMovimento} */ bozza, direzione) {
  const causale = bozza.causale && CAUSALI_PER_DIREZIONE[direzione].includes(bozza.causale)
    ? bozza.causale
    : null;
  return { ...bozza, direzione, causale };
}

/**
 * "12" → 12; null se non è un intero maggiore di zero.
 * @returns {number | null}
 */
export function leggiQuantita(valore) {
  const testo = String(valore ?? '').trim();
  if (!/^\d+$/.test(testo)) return null;
  const n = Number(testo);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}

/**
 * Aggiunge una riga; se l'articolo c'è già, somma le quantità.
 * @returns {RigaMovimento[]}
 */
export function aggiungiRiga(/** @type {RigaMovimento[]} */ righe, articolo_codice, quantita) {
  const esistente = righe.find((r) => r.articolo_codice === articolo_codice);
  if (esistente) {
    return righe.map((r) => (r === esistente ? { ...r, quantita: r.quantita + quantita } : r));
  }
  return [...righe, { articolo_codice, quantita }];
}

/**
 * Controlla la bozza prima del salvataggio.
 * @returns {{ valida: boolean, errori: Record<string, string> }}
 */
export function validaBozza(/** @type {BozzaMovimento} */ bozza) {
  /** @type {Record<string, string>} */
  const errori = {};
  if (!bozza.data || !/^\d{4}-\d{2}-\d{2}$/.test(bozza.data) || Number.isNaN(Date.parse(bozza.data))) {
    errori.data = 'Indica una data valida.';
  }
  if (!bozza.direzione) {
    errori.direzione = 'Scegli uscita o entrata.';
  }
  if (!bozza.causale) {
    errori.causale = 'Scegli la causale.';
  } else if (bozza.direzione && !CAUSALI_PER_DIREZIONE[bozza.direzione].includes(bozza.causale)) {
    errori.causale = 'La causale non è valida per questa direzione.';
  }
  if (!bozza.cliente_codice) {
    errori.cliente = 'Scegli il cliente.';
  }
  if (bozza.righe.length === 0) {
    errori.righe = 'Aggiungi almeno un articolo.';
  } else if (bozza.righe.some((r) => leggiQuantita(r.quantita) === null)) {
    errori.righe = 'Le quantità devono essere numeri interi maggiori di zero.';
  }
  return { valida: Object.keys(errori).length === 0, errori };
}

/** Pezzi totali di un movimento. */
export function pezzi(/** @type {{righe: RigaMovimento[]}} */ mov) {
  return mov.righe.reduce((somma, r) => somma + (Number(r.quantita) || 0), 0);
}

/**
 * Totali del giorno (o di qualunque elenco), esclusi gli annullati.
 * @param {Movimento[]} movimenti
 */
export function totaliMovimenti(movimenti) {
  const totali = {
    uscite: { movimenti: 0, pezzi: 0 },
    entrate: { movimenti: 0, pezzi: 0 },
    saldo: 0,
  };
  for (const m of movimenti) {
    if (m.stato === 'annullato') continue;
    const t = m.direzione === 'USCITA' ? totali.uscite : totali.entrate;
    t.movimenti += 1;
    t.pezzi += pezzi(m);
  }
  totali.saldo = totali.uscite.pezzi - totali.entrate.pezzi;
  return totali;
}

/**
 * Stessa regola del database (puo_modificare_movimento): l'admin modifica
 * qualunque movimento attivo, l'operatore i propri registrati da meno di
 * N giorni. Serve solo a mostrare o nascondere i pulsanti.
 * @param {Movimento} mov
 * @param {Profilo | null} profilo
 */
export function puoModificare(mov, profilo, finestraGiorni, adesso = new Date()) {
  if (!profilo || !profilo.attivo || mov.stato !== 'attivo') return false;
  if (profilo.ruolo === 'admin') return true;
  if (profilo.ruolo !== 'operatore' || mov.operatore_id !== profilo.id) return false;
  const limite = adesso.getTime() - finestraGiorni * 24 * 60 * 60 * 1000;
  return new Date(mov.created_at).getTime() >= limite;
}

/** Chi può registrare nuovi movimenti. */
export function puoRegistrare(/** @type {Profilo | null} */ profilo) {
  return !!profilo?.attivo && (profilo.ruolo === 'admin' || profilo.ruolo === 'operatore');
}

const CAMPI_TESTATA = ['data', 'direzione', 'causale', 'cliente_codice', 'richiesto_da', 'note', 'stato', 'motivo_annullamento'];

/**
 * Differenze tra due fotografie dell'audit, per lo storico modifiche.
 * @returns {{ campi: {campo: string, da: any, a: any}[], righe: {articolo_codice: string, da: number | null, a: number | null}[] }}
 */
export function differenze(prima, dopo) {
  const campi = [];
  for (const campo of CAMPI_TESTATA) {
    const da = prima?.[campo] ?? null;
    const a = dopo?.[campo] ?? null;
    if (da !== a) campi.push({ campo, da, a });
  }
  const quantitaPrima = new Map((prima?.righe ?? []).map((r) => [r.articolo_codice, r.quantita]));
  const quantitaDopo = new Map((dopo?.righe ?? []).map((r) => [r.articolo_codice, r.quantita]));
  const codici = [...new Set([...quantitaPrima.keys(), ...quantitaDopo.keys()])].sort();
  const righe = [];
  for (const codice of codici) {
    const da = quantitaPrima.get(codice) ?? null;
    const a = quantitaDopo.get(codice) ?? null;
    if (da !== a) righe.push({ articolo_codice: codice, da, a });
  }
  return { campi, righe };
}
