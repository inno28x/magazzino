// Ricerca veloce di clienti e articoli, tutta nel browser (le anagrafiche
// sono caricate per intero all'avvio: qualche centinaio di righe).

import { normalizzaTesto } from '../lib/formato.js';

/** @typedef {import('./tipi.js').Cliente} Cliente */
/** @typedef {import('./tipi.js').Articolo} Articolo */

function parole(testo) {
  return normalizzaTesto(testo).split(/\s+/).filter(Boolean);
}

/**
 * Cerca per codice (le cifre iniziali) o per nome: struttura, ragione
 * sociale, gruppo, zona. Tutte le parole digitate devono comparire.
 * @param {Cliente[]} clienti
 * @returns {Cliente[]}
 */
export function cercaClienti(clienti, testo, massimo = 8) {
  const cercate = parole(testo);
  if (cercate.length === 0) return [];
  const attivi = clienti.filter((c) => c.attivo);
  const risultati = [];
  for (const c of attivi) {
    const codice = String(c.codice);
    const indice = normalizzaTesto(`${c.struttura} ${c.ragione_sociale} ${c.gruppo?.nome ?? ''} ${c.zona ?? ''}`);
    let punteggio = -1;
    if (cercate.length === 1 && codice === cercate[0]) punteggio = 0;
    else if (cercate.length === 1 && codice.startsWith(cercate[0])) punteggio = 1;
    else if (cercate.every((p) => indice.includes(p) || codice.startsWith(p))) {
      punteggio = normalizzaTesto(c.struttura).startsWith(cercate[0]) ? 2 : 3;
    }
    if (punteggio >= 0) risultati.push({ c, punteggio });
  }
  risultati.sort((a, b) => a.punteggio - b.punteggio || a.c.struttura.localeCompare(b.c.struttura, 'it'));
  return risultati.slice(0, massimo).map((r) => r.c);
}

/**
 * Cerca per codice (prima i codici che iniziano così) o per descrizione.
 * @param {Articolo[]} articoli
 * @returns {Articolo[]}
 */
export function cercaArticoli(articoli, testo, massimo = 8) {
  const cercate = parole(testo);
  if (cercate.length === 0) return [];
  const primo = cercate[0];
  const risultati = [];
  for (const a of articoli) {
    if (!a.attivo) continue;
    const codice = normalizzaTesto(a.codice);
    const indice = `${codice} ${normalizzaTesto(a.descrizione)} ${a.categoria}`;
    let punteggio = -1;
    if (cercate.length === 1 && codice === primo) punteggio = 0;
    else if (cercate.length === 1 && codice.startsWith(primo)) punteggio = 1;
    else if (cercate.every((p) => indice.includes(p))) punteggio = 2;
    if (punteggio >= 0) risultati.push({ a, punteggio });
  }
  risultati.sort((x, y) => x.punteggio - y.punteggio || x.a.codice.localeCompare(y.a.codice, 'it'));
  return risultati.slice(0, massimo).map((r) => r.a);
}
