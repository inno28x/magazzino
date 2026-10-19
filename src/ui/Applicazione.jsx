import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  caricaArticoli, caricaClienti, caricaImpostazioni, caricaNomiUtenti, esci,
} from '../data/repository.js';
import { ETICHETTE_RUOLO } from '../data/tipi.js';
import { Contesto } from './contesto.js';
import Caricamento from './comuni/Caricamento.jsx';
import Avvisi from './comuni/Avvisi.jsx';
import Oggi from './oggi/Oggi.jsx';
import InArrivo from './InArrivo.jsx';

const PAGINE = [
  { id: 'oggi', titolo: 'Oggi' },
  { id: 'registro', titolo: 'Registro' },
  { id: 'statistiche', titolo: 'Statistiche' },
  { id: 'anagrafiche', titolo: 'Anagrafiche', soloAdmin: true },
  { id: 'impostazioni', titolo: 'Impostazioni', soloAdmin: true },
];

const DESCRIZIONI = {
  registro: 'Tutti i movimenti con filtri per periodo, cliente, gruppo, causale e articolo, totali ed export Excel.',
  statistiche: 'Dashboard, classifica dei clienti problematici, scheda cliente, analisi articoli e vista per gruppo.',
  anagrafiche: 'Gestione di clienti, articoli e gruppi, con import da CSV/Excel.',
  impostazioni: 'Utenti, finestra di modifica, punteggio, backup e dati demo.',
};

function paginaDaIndirizzo() {
  const id = window.location.hash.replace('#/', '').replace('#', '');
  return PAGINE.some((p) => p.id === id) ? id : 'oggi';
}

export default function Applicazione({ profilo }) {
  const [anagrafiche, setAnagrafiche] = useState(null);
  const [erroreCaricamento, setErroreCaricamento] = useState('');
  const [pagina, setPagina] = useState(paginaDaIndirizzo);
  const [avvisi, setAvvisi] = useState([]);
  const progressivo = useRef(0);

  const caricaAnagrafiche = useCallback(async () => {
    setErroreCaricamento('');
    try {
      const [clienti, articoli, impostazioni, nomiUtenti] = await Promise.all([
        caricaClienti(), caricaArticoli(), caricaImpostazioni(), caricaNomiUtenti(),
      ]);
      setAnagrafiche({ clienti, articoli, impostazioni, nomiUtenti });
    } catch (e) {
      setErroreCaricamento(e.message);
    }
  }, []);

  useEffect(() => { caricaAnagrafiche(); }, [caricaAnagrafiche]);

  useEffect(() => {
    const cambia = () => setPagina(paginaDaIndirizzo());
    window.addEventListener('hashchange', cambia);
    return () => window.removeEventListener('hashchange', cambia);
  }, []);

  const chiudiAvviso = useCallback((id) => setAvvisi((a) => a.filter((x) => x.id !== id)), []);

  const avvisa = useCallback((testo, tipo = 'ok') => {
    const id = ++progressivo.current;
    setAvvisi((a) => [...a.slice(-2), { id, testo, tipo }]);
    setTimeout(() => chiudiAvviso(id), tipo === 'errore' ? 8000 : 4000);
  }, [chiudiAvviso]);

  const contesto = useMemo(() => anagrafiche && {
    profilo,
    ...anagrafiche,
    clientiPerCodice: new Map(anagrafiche.clienti.map((c) => [c.codice, c])),
    articoliPerCodice: new Map(anagrafiche.articoli.map((a) => [a.codice, a])),
    avvisa,
    ricaricaAnagrafiche: caricaAnagrafiche,
  }, [anagrafiche, profilo, avvisa, caricaAnagrafiche]);

  if (erroreCaricamento) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="scheda max-w-md p-6 text-center">
          <p className="text-red-800">{erroreCaricamento}</p>
          <button type="button" className="pulsante-primario mt-4" onClick={caricaAnagrafiche}>Riprova</button>
        </div>
      </div>
    );
  }
  if (!contesto) return <Caricamento testo="Caricamento anagrafiche…" />;

  const visibili = PAGINE.filter((p) => !p.soloAdmin || profilo.ruolo === 'admin');
  const titoloPagina = PAGINE.find((p) => p.id === pagina)?.titolo;

  return (
    <Contesto.Provider value={contesto}>
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 sm:px-4">
          <span className="hidden py-3 pr-3 font-bold lg:block">Magazzino biancheria</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto" aria-label="Sezioni">
            {visibili.map((p) => (
              <a
                key={p.id}
                href={`#/${p.id}`}
                aria-current={pagina === p.id ? 'page' : undefined}
                className={`whitespace-nowrap px-3 py-4 text-sm font-semibold sm:px-4 sm:text-base ${
                  pagina === p.id ? 'border-b-4 border-white' : 'border-b-4 border-transparent text-slate-300 hover:text-white'
                }`}
              >
                {p.titolo}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3 pl-2">
            <span className="hidden text-right text-sm leading-tight sm:block">
              {profilo.nome}
              <span className="block text-xs text-slate-400">{ETICHETTE_RUOLO[profilo.ruolo]}</span>
            </span>
            <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              onClick={() => esci()}>
              Esci
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-3 sm:p-4">
        {pagina === 'oggi'
          ? <Oggi />
          : <InArrivo titolo={titoloPagina} descrizione={DESCRIZIONI[pagina]} />}
      </main>

      <Avvisi avvisi={avvisi} onChiudi={chiudiAvviso} />
    </Contesto.Provider>
  );
}
