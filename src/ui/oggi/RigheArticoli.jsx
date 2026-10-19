import { useEffect, useMemo, useRef, useState } from 'react';
import { aggiungiRiga, leggiQuantita, pezzi } from '../../data/movimento.js';
import { cercaArticoli } from '../../data/ricerca.js';
import { ETICHETTE_CATEGORIA } from '../../data/tipi.js';
import { formatNumero } from '../../lib/formato.js';
import { useApp } from '../contesto.js';
import Combobox from '../comuni/Combobox.jsx';

/**
 * Righe articolo del movimento. Inserimento rapido da tastiera:
 * articolo → Invio → quantità → Invio → riga aggiunta, si riparte dall'articolo.
 */
export default function RigheArticoli({ righe, onCambia, errore, articoloRef }) {
  const { articoli, articoliPerCodice } = useApp();
  const [testo, setTesto] = useState('');
  const [scelto, setScelto] = useState(null);
  const [quantita, setQuantita] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const quantitaRef = useRef(null);

  const risultati = useMemo(() => cercaArticoli(articoli, testo), [articoli, testo]);

  // Form svuotato (movimento salvato o annullato): via i messaggi rimasti.
  useEffect(() => {
    if (righe.length === 0) setMessaggio('');
  }, [righe.length]);

  function seleziona(articolo) {
    setScelto(articolo);
    setTesto(`${articolo.codice} — ${articolo.descrizione}`);
    setMessaggio('');
    quantitaRef.current?.focus();
    quantitaRef.current?.select();
  }

  function aggiungi() {
    if (!scelto) {
      setMessaggio('Scegli prima un articolo dall\'elenco.');
      articoloRef.current?.focus();
      return;
    }
    const q = leggiQuantita(quantita);
    if (q === null) {
      setMessaggio('La quantità deve essere un numero intero maggiore di zero.');
      quantitaRef.current?.focus();
      return;
    }
    const giaPresente = righe.some((r) => r.articolo_codice === scelto.codice);
    onCambia(aggiungiRiga(righe, scelto.codice, q));
    setMessaggio(giaPresente ? `${scelto.codice} era già presente: quantità sommate.` : '');
    setScelto(null);
    setTesto('');
    setQuantita('');
    articoloRef.current?.focus();
  }

  function cambiaQuantita(codice, valore) {
    onCambia(righe.map((r) => (r.articolo_codice === codice ? { ...r, quantita: valore } : r)));
  }

  function togli(codice) {
    onCambia(righe.filter((r) => r.articolo_codice !== codice));
  }

  return (
    <fieldset>
      <legend className="etichetta">Articoli</legend>

      {righe.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {righe.map((r) => {
            const articolo = articoliPerCodice.get(r.articolo_codice);
            const valida = leggiQuantita(r.quantita) !== null;
            return (
              <li key={r.articolo_codice} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-semibold">{r.articolo_codice}</div>
                  <div className="truncate text-sm text-slate-600">
                    {articolo ? `${articolo.descrizione} · ${ETICHETTE_CATEGORIA[articolo.categoria]}` : 'Articolo non in anagrafica'}
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label={`Quantità ${r.articolo_codice}`}
                  className={`campo w-24 text-right font-semibold ${valida ? '' : 'border-red-500 bg-red-50'}`}
                  value={r.quantita}
                  onChange={(e) => cambiaQuantita(r.articolo_codice, e.target.value)}
                />
                <button
                  type="button"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-2xl text-slate-500 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Togli ${r.articolo_codice}`}
                  onClick={() => togli(r.articolo_codice)}
                >
                  ×
                </button>
              </li>
            );
          })}
          <li className="flex justify-between bg-slate-50 px-3 py-2 text-sm font-semibold">
            <span>{righe.length} {righe.length === 1 ? 'articolo' : 'articoli'}</span>
            <span>{formatNumero(pezzi({ righe }))} pezzi</span>
          </li>
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Combobox
          className="flex-1"
          testo={testo}
          onCambiaTesto={(t) => { setTesto(t); setScelto(null); }}
          risultati={risultati}
          chiave={(a) => a.codice}
          onSeleziona={seleziona}
          inputRef={articoloRef}
          placeholder="Codice o descrizione articolo"
          errore={errore && righe.length === 0}
          nessunRisultato="Nessun articolo trovato"
          rendiRisultato={(a) => (
            <div className="flex items-baseline gap-3">
              <span className="w-32 shrink-0 font-mono font-semibold">{a.codice}</span>
              <span className="flex-1 truncate">{a.descrizione}</span>
              {a.rfid && <span className="rounded bg-violet-100 px-1.5 text-xs font-semibold text-violet-800">RFID</span>}
            </div>
          )}
        />
        <div className="flex gap-2">
          <input
            ref={quantitaRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Quantità"
            placeholder="Pezzi"
            className="campo w-28 text-right font-semibold"
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                aggiungi();
              }
            }}
          />
          <button type="button" className="pulsante-secondario shrink-0" onClick={aggiungi}>
            Aggiungi
          </button>
        </div>
      </div>
      {messaggio && <p className="mt-2 text-sm text-amber-800">{messaggio}</p>}
      {errore && <p className="mt-2 text-sm text-red-700">{errore}</p>}
    </fieldset>
  );
}
