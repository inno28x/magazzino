import { useMemo, useRef, useState } from 'react';
import { conDirezione, validaBozza } from '../../data/movimento.js';
import { cercaClienti } from '../../data/ricerca.js';
import {
  CAUSALI_PER_DIREZIONE, DESCRIZIONI_DIREZIONE, DIREZIONI, ETICHETTE_CAUSALE, ETICHETTE_DIREZIONE,
} from '../../data/tipi.js';
import { formatData, oggiISO } from '../../lib/formato.js';
import { useApp } from '../contesto.js';
import Combobox from '../comuni/Combobox.jsx';
import { COLORI_DIREZIONE } from '../comuni/Etichette.jsx';
import RigheArticoli from './RigheArticoli.jsx';

/**
 * Form di inserimento rapido (e di modifica) di un movimento.
 * modalita: "nuovo" | "modifica" | "duplicato"
 */
export default function FormMovimento({
  bozza, onCambia, modalita, onSalva, onAnnullaModifica, inSalvataggio, avvisoEsterno, onRicarica, clienteRef,
}) {
  const { clienti, clientiPerCodice } = useApp();
  const [testoCliente, setTestoCliente] = useState('');
  const [tentato, setTentato] = useState(false);
  const articoloRef = useRef(null);

  const risultatiClienti = useMemo(() => cercaClienti(clienti, testoCliente), [clienti, testoCliente]);
  const cliente = bozza.cliente_codice ? clientiPerCodice.get(bozza.cliente_codice) : null;
  const { valida, errori } = validaBozza(bozza);
  const mostraErrori = tentato ? errori : {};
  const oggi = oggiISO();

  function aggiorna(campi) {
    onCambia({ ...bozza, ...campi });
  }

  function invia() {
    setTentato(true);
    if (!valida || inSalvataggio) return;
    setTentato(false);
    setTestoCliente('');
    onSalva(bozza);
  }

  function tasto(e) {
    if (e.key !== 'Enter') return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      invia();
    } else if (e.target.tagName === 'INPUT') {
      // Invio nei campi non salva: serve solo per l'inserimento rapido delle righe.
      e.preventDefault();
    }
  }

  const titolo = {
    nuovo: 'Nuovo movimento',
    modifica: `Modifica movimento n° ${bozza.id}`,
    duplicato: 'Nuovo movimento (copia)',
  }[modalita];

  const testoPulsante = modalita === 'modifica'
    ? 'Salva modifiche'
    : bozza.direzione ? `Registra ${ETICHETTE_DIREZIONE[bozza.direzione].toLowerCase()}` : 'Registra';

  return (
    <form
      className={`scheda p-4 sm:p-5 ${modalita === 'modifica' ? 'ring-2 ring-amber-400' : ''}`}
      onSubmit={(e) => { e.preventDefault(); invia(); }}
      onKeyDown={tasto}
      noValidate
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{titolo}</h2>
        {modalita !== 'nuovo' && (
          <button type="button" className="pulsante-secondario min-h-10 px-3 text-sm" onClick={onAnnullaModifica}>
            {modalita === 'modifica' ? 'Annulla modifica' : 'Svuota'}
          </button>
        )}
      </div>

      {avvisoEsterno && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900" role="alert">
          <p className="font-semibold">{avvisoEsterno}</p>
          <p className="mt-1 text-sm">Se salvi adesso ti verrà chiesto come procedere.</p>
          <button type="button" className="pulsante-secondario mt-2 min-h-10 text-sm" onClick={onRicarica}>
            Carica la versione aggiornata
          </button>
        </div>
      )}

      {/* Direzione */}
      <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direzione">
        {DIREZIONI.map((d) => {
          const attiva = bozza.direzione === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={attiva}
              className={`min-h-16 rounded-xl border-2 px-3 py-2 text-left transition ${
                attiva ? COLORI_DIREZIONE[d].pieno : 'border-slate-200 bg-white hover:border-slate-400'
              }`}
              onClick={() => onCambia(conDirezione(bozza, d))}
            >
              <span className="block text-lg font-bold">{d === 'USCITA' ? '↑' : '↓'} {ETICHETTE_DIREZIONE[d]}</span>
              <span className={`block text-sm ${attiva ? 'opacity-90' : 'text-slate-500'}`}>{DESCRIZIONI_DIREZIONE[d]}</span>
            </button>
          );
        })}
      </div>
      {mostraErrori.direzione && <p className="-mt-2 mb-3 text-sm text-red-700">{mostraErrori.direzione}</p>}

      {/* Causale */}
      <div className="mb-4">
        <span className="etichetta">Causale</span>
        {bozza.direzione ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Causale">
            {CAUSALI_PER_DIREZIONE[bozza.direzione].map((c) => {
              const attiva = bozza.causale === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={attiva}
                  className={`min-h-12 rounded-lg border-2 px-3 font-semibold transition ${
                    attiva ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-400'
                  }`}
                  onClick={() => aggiorna({ causale: c })}
                >
                  {ETICHETTE_CAUSALE[c]}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">Scegli prima uscita o entrata.</p>
        )}
        {mostraErrori.causale && <p className="mt-1 text-sm text-red-700">{mostraErrori.causale}</p>}
      </div>

      {/* Cliente */}
      <div className="mb-4">
        {cliente ? (
          <>
            <span className="etichetta">Cliente</span>
            <div className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{cliente.struttura}</div>
                <div className="truncate text-sm text-slate-600">
                  Cod. {cliente.codice} · {cliente.ragione_sociale}{cliente.zona ? ` · ${cliente.zona}` : ''}
                </div>
              </div>
              <button
                type="button"
                className="pulsante-secondario min-h-10 px-3 text-sm"
                onClick={() => {
                  aggiorna({ cliente_codice: null });
                  setTimeout(() => clienteRef.current?.focus(), 0);
                }}
              >
                Cambia
              </button>
            </div>
          </>
        ) : (
          <Combobox
            etichetta="Cliente"
            testo={testoCliente}
            onCambiaTesto={setTestoCliente}
            risultati={risultatiClienti}
            chiave={(c) => c.codice}
            onSeleziona={(c) => {
              aggiorna({ cliente_codice: c.codice });
              setTestoCliente('');
              setTimeout(() => articoloRef.current?.focus(), 0);
            }}
            inputRef={clienteRef}
            placeholder="Codice o nome della struttura"
            errore={mostraErrori.cliente}
            nessunRisultato="Nessun cliente attivo trovato"
            rendiRisultato={(c) => (
              <div>
                <div className="font-semibold">
                  <span className="mr-2 font-mono text-slate-500">{c.codice}</span>{c.struttura}
                </div>
                <div className="text-sm text-slate-600">
                  {c.ragione_sociale}{c.gruppo ? ` · ${c.gruppo.nome}` : ''}{c.zona ? ` · ${c.zona}` : ''}
                </div>
              </div>
            )}
          />
        )}
        {mostraErrori.cliente && <p className="mt-1 text-sm text-red-700">{mostraErrori.cliente}</p>}
      </div>

      {/* Righe */}
      <div className="mb-4">
        <RigheArticoli
          righe={bozza.righe}
          onCambia={(righe) => aggiorna({ righe })}
          errore={mostraErrori.righe}
          articoloRef={articoloRef}
        />
      </div>

      {/* Dettagli */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="data-movimento" className="etichetta">Data</label>
          <input
            id="data-movimento"
            type="date"
            className={`campo ${mostraErrori.data ? 'border-red-500' : ''}`}
            value={bozza.data}
            onChange={(e) => aggiorna({ data: e.target.value })}
          />
          {bozza.data && bozza.data !== oggi && (
            <p className="mt-1 text-sm text-amber-800">Attenzione: data diversa da oggi ({formatData(bozza.data)}).</p>
          )}
          {mostraErrori.data && <p className="mt-1 text-sm text-red-700">{mostraErrori.data}</p>}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="richiesto-da" className="etichetta">Richiesto da <span className="font-normal text-slate-500">(facoltativo)</span></label>
          <input
            id="richiesto-da"
            type="text"
            className="campo"
            placeholder="Referente del cliente"
            value={bozza.richiesto_da}
            onChange={(e) => aggiorna({ richiesto_da: e.target.value })}
          />
        </div>
        <div className="sm:col-span-3">
          <label htmlFor="note" className="etichetta">Note <span className="font-normal text-slate-500">(facoltative)</span></label>
          <textarea
            id="note"
            rows={2}
            className="campo py-2"
            value={bozza.note}
            onChange={(e) => aggiorna({ note: e.target.value })}
          />
        </div>
      </div>

      <button
        type="submit"
        className={`pulsante-primario w-full min-h-14 text-lg ${
          modalita !== 'modifica' && bozza.direzione ? COLORI_DIREZIONE[bozza.direzione].pieno : ''
        }`}
        disabled={inSalvataggio}
      >
        {inSalvataggio ? 'Salvataggio…' : testoPulsante}
      </button>
      <p className="mt-2 hidden text-center text-xs text-slate-500 lg:block">Ctrl + Invio per salvare</p>
    </form>
  );
}
