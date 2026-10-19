import { useCallback, useEffect, useState } from 'react';
import {
  annullaMovimento, caricaMovimento, ripristinaMovimento, storicoMovimento,
} from '../../data/repository.js';
import { differenze, pezzi, puoModificare, puoRegistrare } from '../../data/movimento.js';
import {
  ETICHETTE_AZIONE_AUDIT, ETICHETTE_CATEGORIA, ETICHETTE_CAUSALE, ETICHETTE_DIREZIONE,
} from '../../data/tipi.js';
import { formatData, formatDataOra, formatNumero } from '../../lib/formato.js';
import { useApp } from '../contesto.js';
import Dialogo from '../comuni/Dialogo.jsx';
import { BadgeAnnullato, BadgeCausale, BadgeDirezione } from '../comuni/Etichette.jsx';

/**
 * Pannello laterale con il dettaglio di un movimento, le azioni consentite
 * e lo storico delle modifiche. Si ricarica quando cambia "versioneNota"
 * (aggiornamento in tempo reale da un altro utente).
 */
export default function SchedaMovimento({ id, versioneNota, onChiudi, onModifica, onDuplica, onCambiato }) {
  const { profilo, impostazioni, clientiPerCodice, articoliPerCodice, nomiUtenti, avvisa } = useApp();
  const [movimento, setMovimento] = useState(undefined);
  const [storico, setStorico] = useState([]);
  const [errore, setErrore] = useState('');
  const [chiediMotivo, setChiediMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    setErrore('');
    try {
      const [mov, voci] = await Promise.all([caricaMovimento(id), storicoMovimento(id)]);
      setMovimento(mov);
      setStorico(voci);
    } catch (e) {
      setErrore(e.message);
    }
  }, [id]);

  useEffect(() => { carica(); }, [carica, versioneNota]);

  useEffect(() => {
    const tasto = (e) => { if (e.key === 'Escape' && !chiediMotivo) onChiudi(); };
    window.addEventListener('keydown', tasto);
    return () => window.removeEventListener('keydown', tasto);
  }, [onChiudi, chiediMotivo]);

  async function annulla() {
    if (!motivo.trim()) return;
    setInCorso(true);
    try {
      await annullaMovimento(movimento.id, movimento.versione, motivo);
      avvisa(`Movimento n° ${movimento.id} annullato.`);
      setChiediMotivo(false);
      setMotivo('');
      await carica();
      onCambiato?.(movimento.id);
    } catch (e) {
      avvisa(e.message, 'errore');
      await carica();
    } finally {
      setInCorso(false);
    }
  }

  async function ripristina() {
    setInCorso(true);
    try {
      await ripristinaMovimento(movimento.id, movimento.versione);
      avvisa(`Movimento n° ${movimento.id} ripristinato.`);
      await carica();
      onCambiato?.(movimento.id);
    } catch (e) {
      avvisa(e.message, 'errore');
    } finally {
      setInCorso(false);
    }
  }

  const cliente = movimento ? clientiPerCodice.get(movimento.cliente_codice) : null;
  const modificabile = movimento && puoModificare(movimento, profilo, impostazioni.finestra_modifica_giorni);
  const admin = profilo.ruolo === 'admin';

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi(); }}>
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" aria-label="Dettaglio movimento">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold">Movimento n° {id}</h2>
          <button type="button" className="h-12 w-12 rounded-lg text-2xl text-slate-500 hover:bg-slate-100" aria-label="Chiudi" onClick={onChiudi}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {errore && <p className="rounded-lg bg-red-50 p-3 text-red-800">{errore}</p>}
          {movimento === undefined && !errore && <p className="text-slate-500">Caricamento…</p>}
          {movimento === null && <p className="text-slate-600">Il movimento non esiste più o non è visibile.</p>}

          {movimento && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <BadgeDirezione direzione={movimento.direzione} />
                <BadgeCausale causale={movimento.causale} />
                {movimento.stato === 'annullato' && <BadgeAnnullato />}
              </div>

              {movimento.stato === 'annullato' && (
                <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">
                  <p><strong>Annullato</strong> da {movimento.annullato_da_profilo?.nome ?? '—'} il {formatDataOra(movimento.annullato_il)}</p>
                  <p className="mt-1">Motivo: {movimento.motivo_annullamento}</p>
                </div>
              )}

              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500">Cliente</dt>
                <dd>
                  <span className="font-semibold">{cliente?.struttura ?? '—'}</span>
                  <span className="block text-slate-600">Cod. {movimento.cliente_codice}{cliente ? ` · ${cliente.ragione_sociale}` : ''}</span>
                </dd>
                <dt className="text-slate-500">Data</dt>
                <dd>{formatData(movimento.data)}</dd>
                <dt className="text-slate-500">Richiesto da</dt>
                <dd>{movimento.richiesto_da || '—'}</dd>
                <dt className="text-slate-500">Operatore</dt>
                <dd>{movimento.operatore?.nome ?? '—'}</dd>
                <dt className="text-slate-500">Registrato il</dt>
                <dd>{formatDataOra(movimento.created_at)}</dd>
                {movimento.updated_at && (
                  <>
                    <dt className="text-slate-500">Ultima modifica</dt>
                    <dd>{formatDataOra(movimento.updated_at)} · {movimento.modificato_da?.nome ?? '—'}</dd>
                  </>
                )}
                {movimento.note && (
                  <>
                    <dt className="text-slate-500">Note</dt>
                    <dd className="whitespace-pre-line">{movimento.note}</dd>
                  </>
                )}
              </dl>

              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 font-medium">Articolo</th>
                    <th className="py-2 text-right font-medium">Pezzi</th>
                  </tr>
                </thead>
                <tbody>
                  {movimento.righe.map((r) => {
                    const articolo = articoliPerCodice.get(r.articolo_codice);
                    return (
                      <tr key={r.articolo_codice} className="border-b border-slate-100">
                        <td className="py-2">
                          <span className="font-mono font-semibold">{r.articolo_codice}</span>
                          <span className="block text-slate-600">
                            {articolo ? `${articolo.descrizione} · ${ETICHETTE_CATEGORIA[articolo.categoria]}` : ''}
                          </span>
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">{formatNumero(r.quantita)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-2 font-semibold">Totale</td>
                    <td className="py-2 text-right font-bold tabular-nums">{formatNumero(pezzi(movimento))}</td>
                  </tr>
                </tbody>
              </table>

              <h3 className="mt-6 mb-2 font-bold">Storico modifiche</h3>
              {storico.length === 0 && <p className="text-sm text-slate-500">Nessuna voce.</p>}
              <ol className="space-y-3">
                {storico.map((v) => (
                  <VoceStorico key={v.id} voce={v} nomiUtenti={nomiUtenti} clientiPerCodice={clientiPerCodice} />
                ))}
              </ol>
            </>
          )}
        </div>

        {movimento && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3">
            {modificabile && (
              <button type="button" className="pulsante-primario flex-1" onClick={() => onModifica(movimento)}>Modifica</button>
            )}
            {puoRegistrare(profilo) && movimento.stato === 'attivo' && (
              <button type="button" className="pulsante-secondario flex-1" onClick={() => onDuplica(movimento)}>Duplica</button>
            )}
            {admin && movimento.stato === 'attivo' && (
              <button type="button" className="pulsante-secondario flex-1 text-red-700" onClick={() => setChiediMotivo(true)}>Annulla movimento</button>
            )}
            {admin && movimento.stato === 'annullato' && (
              <button type="button" className="pulsante-secondario flex-1" disabled={inCorso} onClick={ripristina}>Ripristina</button>
            )}
            {!modificabile && movimento.stato === 'attivo' && profilo.ruolo === 'operatore' && (
              <p className="w-full text-sm text-slate-500">
                {movimento.operatore_id === profilo.id
                  ? `Non più modificabile: sono passati più di ${impostazioni.finestra_modifica_giorni} giorni dalla registrazione.`
                  : 'Puoi modificare solo i movimenti registrati da te.'}
              </p>
            )}
          </div>
        )}
      </aside>

      {chiediMotivo && (
        <Dialogo
          titolo={`Annullare il movimento n° ${movimento.id}?`}
          onChiudi={() => setChiediMotivo(false)}
          azioni={(
            <>
              <button type="button" className="pulsante-secondario" onClick={() => setChiediMotivo(false)}>Indietro</button>
              <button type="button" className="pulsante-pericolo" disabled={!motivo.trim() || inCorso} onClick={annulla}>
                Annulla movimento
              </button>
            </>
          )}
        >
          <p className="mb-3 text-sm">
            Il movimento resta nello storico ma non conta più nei totali e nelle statistiche. Potrai ripristinarlo.
          </p>
          <label htmlFor="motivo" className="etichetta">Motivo (obbligatorio)</label>
          <textarea id="motivo" rows={3} className="campo py-2" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Dialogo>
      )}
    </div>
  );
}

const NOMI_CAMPI = {
  data: 'Data',
  direzione: 'Direzione',
  causale: 'Causale',
  cliente_codice: 'Cliente',
  richiesto_da: 'Richiesto da',
  note: 'Note',
  stato: 'Stato',
  motivo_annullamento: 'Motivo annullamento',
};

function valoreLeggibile(campo, valore, clientiPerCodice) {
  if (valore === null || valore === '') return '—';
  if (campo === 'data') return formatData(valore);
  if (campo === 'direzione') return ETICHETTE_DIREZIONE[valore];
  if (campo === 'causale') return ETICHETTE_CAUSALE[valore];
  if (campo === 'cliente_codice') {
    const c = clientiPerCodice.get(valore);
    return c ? `${c.struttura} (${valore})` : String(valore);
  }
  return String(valore);
}

function VoceStorico({ voce, nomiUtenti, clientiPerCodice }) {
  const { campi, righe } = differenze(voce.prima, voce.dopo);
  const creazione = voce.azione === 'creazione';
  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <span className="font-semibold">{ETICHETTE_AZIONE_AUDIT[voce.azione]}</span>
        <span className="text-slate-500">
          {formatDataOra(voce.eseguito_il)} · {nomiUtenti.get(voce.utente_id) ?? 'sistema'}
        </span>
      </div>
      {!creazione && (campi.length > 0 || righe.length > 0) && (
        <ul className="mt-2 space-y-0.5 text-slate-700">
          {campi.filter((c) => c.campo !== 'stato').map((c) => (
            <li key={c.campo}>
              {NOMI_CAMPI[c.campo]}: <span className="text-slate-500 line-through">{valoreLeggibile(c.campo, c.da, clientiPerCodice)}</span>
              {' → '}<strong>{valoreLeggibile(c.campo, c.a, clientiPerCodice)}</strong>
            </li>
          ))}
          {righe.map((r) => (
            <li key={r.articolo_codice}>
              <span className="font-mono">{r.articolo_codice}</span>:{' '}
              {r.da === null ? <>aggiunto <strong>×{formatNumero(r.a)}</strong></>
                : r.a === null ? <>tolto (era ×{formatNumero(r.da)})</>
                  : <><span className="text-slate-500 line-through">{formatNumero(r.da)}</span> → <strong>{formatNumero(r.a)}</strong></>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
