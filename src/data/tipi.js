// Modello dati dell'applicazione: tipi e costanti condivise.
// Rispecchia lo schema in supabase/01_schema.sql. L'interfaccia usa solo
// questi tipi e le funzioni di repository.js: cambiando backend si riscrive
// repository.js, non le schermate.

/** @typedef {'admin' | 'operatore' | 'lettura'} Ruolo */
/** @typedef {'USCITA' | 'ENTRATA'} Direzione */
/** @typedef {'AUMENTO_DOTAZIONE' | 'REINTEGRO_INVENTARIO' | 'RITIRO_DOTAZIONE' | 'RITIRO_INVENTARIO' | 'ALTRO'} Causale */
/** @typedef {'federe' | 'lenzuola' | 'copripiumini' | 'sovrapiumini' | 'spugna' | 'tovagliato' | 'altro'} Categoria */
/** @typedef {'attivo' | 'annullato'} StatoMovimento */

/**
 * @typedef {Object} Profilo
 * @property {string} id            uuid dell'utente
 * @property {string} email
 * @property {string} nome
 * @property {Ruolo} ruolo
 * @property {boolean} attivo
 */

/**
 * @typedef {Object} Gruppo
 * @property {number} id
 * @property {string} nome
 */

/**
 * @typedef {Object} Cliente
 * @property {number} codice          codice del gestionale: è la chiave
 * @property {string} ragione_sociale non univoca (catene con più strutture)
 * @property {string} struttura
 * @property {Gruppo | null} gruppo
 * @property {string | null} zona
 * @property {boolean} attivo
 */

/**
 * @typedef {Object} Articolo
 * @property {string} codice       es. "FED5080T"
 * @property {string} descrizione
 * @property {Categoria} categoria
 * @property {boolean} rfid
 * @property {string} codice_base  codice senza la T finale delle varianti RFID
 * @property {boolean} attivo
 */

/**
 * @typedef {Object} RigaMovimento
 * @property {string} articolo_codice
 * @property {number} quantita     intero > 0
 */

/**
 * @typedef {Object} Movimento
 * @property {number} id
 * @property {string} data                 "aaaa-mm-gg"
 * @property {Direzione} direzione
 * @property {Causale} causale
 * @property {number} cliente_codice
 * @property {string | null} richiesto_da
 * @property {string | null} note
 * @property {string} operatore_id
 * @property {{nome: string} | null} operatore
 * @property {StatoMovimento} stato
 * @property {string | null} motivo_annullamento
 * @property {string | null} annullato_il
 * @property {{nome: string} | null} annullato_da_profilo
 * @property {number} versione
 * @property {string} created_at
 * @property {string | null} updated_at
 * @property {{nome: string} | null} modificato_da
 * @property {RigaMovimento[]} righe
 */

/**
 * Movimento in compilazione nel form (nuovo, in modifica o duplicato).
 * @typedef {Object} BozzaMovimento
 * @property {number | null} id         null = nuovo
 * @property {number | null} versione   versione letta, per il controllo dei conflitti
 * @property {string} data
 * @property {Direzione | null} direzione
 * @property {Causale | null} causale
 * @property {number | null} cliente_codice
 * @property {string} richiesto_da
 * @property {string} note
 * @property {RigaMovimento[]} righe
 */

/**
 * @typedef {Object} VoceAudit
 * @property {number} id
 * @property {number} movimento_id
 * @property {'creazione' | 'modifica' | 'annullamento' | 'ripristino'} azione
 * @property {string | null} utente_id
 * @property {string} eseguito_il
 * @property {Object | null} prima   testata + righe prima del salvataggio
 * @property {Object | null} dopo    testata + righe dopo
 */

/**
 * @typedef {Object} Impostazioni
 * @property {number} finestra_modifica_giorni
 * @property {number} peso_reintegri
 * @property {number} peso_frequenza
 * @property {number} peso_saldo
 * @property {number} soglia_allerta
 * @property {number} giorni_avviso_backup
 * @property {string | null} ultimo_backup_il
 */

export const DIREZIONI = /** @type {const} */ (['USCITA', 'ENTRATA']);

export const ETICHETTE_DIREZIONE = {
  USCITA: 'Uscita',
  ENTRATA: 'Entrata',
};

export const DESCRIZIONI_DIREZIONE = {
  USCITA: 'verso il cliente',
  ENTRATA: 'rientro dal cliente',
};

/** @type {Record<Direzione, Causale[]>} */
export const CAUSALI_PER_DIREZIONE = {
  USCITA: ['REINTEGRO_INVENTARIO', 'AUMENTO_DOTAZIONE', 'ALTRO'],
  ENTRATA: ['RITIRO_INVENTARIO', 'RITIRO_DOTAZIONE', 'ALTRO'],
};

export const ETICHETTE_CAUSALE = {
  AUMENTO_DOTAZIONE: 'Aumento dotazione',
  REINTEGRO_INVENTARIO: 'Reintegro inventario',
  RITIRO_DOTAZIONE: 'Ritiro dotazione',
  RITIRO_INVENTARIO: 'Ritiro inventario',
  ALTRO: 'Altro',
};

export const CATEGORIE = /** @type {const} */ ([
  'federe', 'lenzuola', 'copripiumini', 'sovrapiumini', 'spugna', 'tovagliato', 'altro',
]);

export const ETICHETTE_CATEGORIA = {
  federe: 'Federe',
  lenzuola: 'Lenzuola',
  copripiumini: 'Copripiumini',
  sovrapiumini: 'Sovrapiumini',
  spugna: 'Spugna',
  tovagliato: 'Tovagliato',
  altro: 'Altro',
};

export const ETICHETTE_RUOLO = {
  admin: 'Amministratore',
  operatore: 'Operatore',
  lettura: 'Sola lettura',
};

export const ETICHETTE_AZIONE_AUDIT = {
  creazione: 'Creato',
  modifica: 'Modificato',
  annullamento: 'Annullato',
  ripristino: 'Ripristinato',
};
