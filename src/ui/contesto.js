import { createContext, useContext } from 'react';

/**
 * Dati condivisi da tutte le schermate dopo l'accesso.
 * @typedef {Object} ContestoApp
 * @property {import('../data/tipi.js').Profilo} profilo
 * @property {import('../data/tipi.js').Cliente[]} clienti
 * @property {import('../data/tipi.js').Articolo[]} articoli
 * @property {Map<number, import('../data/tipi.js').Cliente>} clientiPerCodice
 * @property {Map<string, import('../data/tipi.js').Articolo>} articoliPerCodice
 * @property {import('../data/tipi.js').Impostazioni} impostazioni
 * @property {Map<string, string>} nomiUtenti
 * @property {(testo: string, tipo?: 'ok' | 'errore' | 'info') => void} avvisa
 */

export const Contesto = createContext(/** @type {ContestoApp | null} */ (null));

/** @returns {ContestoApp} */
export function useApp() {
  const valore = useContext(Contesto);
  if (!valore) throw new Error('useApp usato fuori da <Contesto.Provider>');
  return valore;
}
