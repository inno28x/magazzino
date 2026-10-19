// Traduzione degli errori del database e della rete in messaggi per chi usa l'app.

export class ErroreApp extends Error {
  /**
   * @param {string} codice    es. "MOVIMENTO_CAMBIATO"
   * @param {string} messaggio testo in italiano da mostrare
   */
  constructor(codice, messaggio) {
    super(messaggio);
    this.name = 'ErroreApp';
    this.codice = codice;
  }
}

const MESSAGGI = {
  MOVIMENTO_CAMBIATO: 'Il movimento è stato modificato da un altro utente mentre lo stavi modificando.',
  MOVIMENTO_NON_TROVATO: 'Il movimento non esiste più o non è visibile.',
  MOVIMENTO_ANNULLATO: 'Il movimento è annullato: va prima ripristinato.',
  PERMESSO_NEGATO: 'Non hai i permessi per questa operazione.',
  RIGHE_MANCANTI: 'Aggiungi almeno un articolo.',
  QUANTITA_NON_VALIDA: 'Le quantità devono essere numeri interi maggiori di zero.',
  MOTIVO_MANCANTE: 'Indica il motivo dell\'annullamento.',
  ULTIMO_ADMIN: 'Deve restare almeno un amministratore attivo.',
  DATI_REALI_PRESENTI: 'Ci sono già movimenti reali: i dati demo non vengono generati.',
  DEMO_GIA_PRESENTI: 'I dati demo sono già presenti.',
  DEMO_IN_USO: 'Alcuni clienti o articoli demo sono usati in movimenti reali.',
  NESSUN_ADMIN: 'Crea prima un utente amministratore.',
};

/**
 * Converte un errore di Supabase (o di rete) in un ErroreApp.
 * @param {any} errore  { code, message, details, hint } di PostgREST, o un Error
 * @returns {ErroreApp}
 */
export function traduciErrore(errore) {
  if (errore instanceof ErroreApp) return errore;
  const messaggio = String(errore?.message ?? errore ?? '');
  const dettagli = errore?.details ? String(errore.details) : '';

  const codice = Object.keys(MESSAGGI).find((c) => messaggio.startsWith(c));
  if (codice) return new ErroreApp(codice, dettagli || MESSAGGI[codice]);

  if (/row-level security/i.test(messaggio) || errore?.code === '42501') {
    return new ErroreApp('PERMESSO_NEGATO', MESSAGGI.PERMESSO_NEGATO);
  }
  if (errore?.code === '23503') {
    return new ErroreApp('RIFERIMENTO', 'Cliente o articolo inesistente, oppure ancora usato in qualche movimento.');
  }
  if (errore?.code === '23505') {
    return new ErroreApp('DUPLICATO', 'Esiste già un elemento con lo stesso codice o nome.');
  }
  if (errore?.code === '23514' || errore?.code === '23502') {
    return new ErroreApp('DATI_NON_VALIDI', 'Alcuni dati non sono validi: controlla i campi obbligatori.');
  }
  if (/invalid login credentials/i.test(messaggio)) {
    return new ErroreApp('CREDENZIALI', 'Email o password non corretti.');
  }
  if (/email not confirmed/i.test(messaggio)) {
    return new ErroreApp('EMAIL_NON_CONFERMATA', 'L\'indirizzo email non è ancora confermato.');
  }
  if (/password should be|weak password/i.test(messaggio)) {
    return new ErroreApp('PASSWORD_DEBOLE', 'La password è troppo semplice: usa almeno 8 caratteri.');
  }
  if (/failed to fetch|network|load failed|fetch failed/i.test(messaggio)) {
    return new ErroreApp('RETE', 'Connessione assente o instabile: riprova tra poco.');
  }
  return new ErroreApp('SCONOSCIUTO', messaggio || 'Si è verificato un errore imprevisto.');
}
