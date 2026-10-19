import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ascoltaMovimenti, caricaMovimento, movimentiDelGiorno, salvaMovimento,
} from '../../data/repository.js';
import {
  bozzaDaMovimento, bozzaDuplicata, bozzaVuota, puoRegistrare,
} from '../../data/movimento.js';
import { formatData, formatOra, oggiISO } from '../../lib/formato.js';
import { useApp } from '../contesto.js';
import Dialogo from '../comuni/Dialogo.jsx';
import FormMovimento from './FormMovimento.jsx';
import ListaMovimenti from './ListaMovimenti.jsx';
import SchedaMovimento from './SchedaMovimento.jsx';

/** Inserisce o sostituisce un movimento nella lista (dal più recente). */
function conMovimento(lista, id, movimento, giorno) {
  const senza = lista.filter((m) => m.id !== id);
  if (!movimento || movimento.data !== giorno) return senza;
  return [...senza, movimento].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Home: form di inserimento rapido + movimenti del giorno in tempo reale. */
export default function Oggi() {
  const { profilo, avvisa } = useApp();
  const scrive = puoRegistrare(profilo);

  const [giorno, setGiorno] = useState(oggiISO);
  const [movimenti, setMovimenti] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [mostraAnnullati, setMostraAnnullati] = useState(false);
  const [evidenziati, setEvidenziati] = useState(() => new Set());

  const [bozza, setBozza] = useState(() => bozzaVuota(oggiISO()));
  const [modalita, setModalita] = useState('nuovo');
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const [conflitto, setConflitto] = useState(null);
  const [avvisoEsterno, setAvvisoEsterno] = useState('');

  const [schedaId, setSchedaId] = useState(null);
  const [versioni, setVersioni] = useState({});

  const clienteRef = useRef(null);
  const formRef = useRef(null);
  // Valori correnti letti dal callback del tempo reale.
  const giornoRef = useRef(giorno);
  const bozzaRef = useRef(bozza);
  giornoRef.current = giorno;
  bozzaRef.current = bozza;

  // Caricamento del giorno scelto.
  useEffect(() => {
    let valido = true;
    setCaricamento(true);
    movimentiDelGiorno(giorno)
      .then((lista) => { if (valido) setMovimenti(lista); })
      .catch((e) => { if (valido) avvisa(e.message, 'errore'); })
      .finally(() => { if (valido) setCaricamento(false); });
    return () => { valido = false; };
  }, [giorno, avvisa]);

  const evidenzia = useCallback((id) => {
    setEvidenziati((s) => new Set(s).add(id));
    setTimeout(() => setEvidenziati((s) => {
      const nuovo = new Set(s);
      nuovo.delete(id);
      return nuovo;
    }), 2500);
  }, []);

  const aggiornaDaServer = useCallback(async (id) => {
    const movimento = await caricaMovimento(id);
    setMovimenti((lista) => conMovimento(lista, id, movimento, giornoRef.current));
    return movimento;
  }, []);

  // Tempo reale: qualcuno (anche un'altra postazione) ha creato o cambiato un movimento.
  useEffect(() => ascoltaMovimenti(async (testata) => {
    try {
      const movimento = await aggiornaDaServer(testata.id);
      setVersioni((v) => ({ ...v, [testata.id]: testata.versione }));
      if (movimento?.data === giornoRef.current) evidenzia(testata.id);

      const inModifica = bozzaRef.current;
      if (inModifica.id === testata.id && testata.updated_by !== profilo.id) {
        if (!movimento) {
          setAvvisoEsterno('Questo movimento è stato annullato da un amministratore.');
        } else if (movimento.versione !== inModifica.versione) {
          setAvvisoEsterno(
            `Questo movimento è stato modificato da ${movimento.modificato_da?.nome ?? 'un altro utente'} alle ${formatOra(movimento.updated_at)}.`,
          );
        }
      }
    } catch {
      // Un aggiornamento perso non è grave: la lista si riallinea al prossimo evento o cambio giorno.
    }
  }), [aggiornaDaServer, evidenzia, profilo.id]);

  function nuovaBozza(dataDaTenere, direzione = null) {
    setBozza(bozzaVuota(dataDaTenere ?? oggiISO(), direzione));
    setModalita('nuovo');
    setAvvisoEsterno('');
  }

  function portaAlForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function salva(daSalvare) {
    setInSalvataggio(true);
    try {
      const { id, data } = await salvaMovimento(daSalvare);
      await aggiornaDaServer(id);
      evidenzia(id);
      const verbo = daSalvare.id ? 'modificato' : 'registrato';
      avvisa(`Movimento n° ${id} ${verbo}${data !== giorno ? ` in data ${formatData(data)}` : ''}.`);
      if (daSalvare.id) nuovaBozza();
      else nuovaBozza(daSalvare.data, daSalvare.direzione);
      setTimeout(() => clienteRef.current?.focus(), 0);
    } catch (e) {
      if (e.codice === 'MOVIMENTO_CAMBIATO') setConflitto(e.message);
      else avvisa(e.message, 'errore');
    } finally {
      setInSalvataggio(false);
    }
  }

  async function ricaricaInModifica() {
    setConflitto(null);
    setAvvisoEsterno('');
    try {
      const movimento = await aggiornaDaServer(bozza.id);
      if (movimento) {
        setBozza(bozzaDaMovimento(movimento));
        avvisa('Caricata la versione aggiornata.', 'info');
      } else {
        nuovaBozza();
        avvisa('Il movimento non è più disponibile.', 'info');
      }
    } catch (e) {
      avvisa(e.message, 'errore');
    }
  }

  async function tieniLeMieModifiche() {
    setConflitto(null);
    try {
      const movimento = await caricaMovimento(bozza.id);
      if (!movimento) {
        nuovaBozza();
        avvisa('Il movimento non è più disponibile.', 'errore');
        return;
      }
      setBozza((b) => ({ ...b, versione: movimento.versione }));
      setAvvisoEsterno('');
      avvisa('Le tue modifiche sono ancora nel form: salvando sostituirai la versione dell\'altro utente.', 'info');
    } catch (e) {
      avvisa(e.message, 'errore');
    }
  }

  function modifica(movimento) {
    setBozza(bozzaDaMovimento(movimento));
    setModalita('modifica');
    setAvvisoEsterno('');
    setSchedaId(null);
    portaAlForm();
  }

  function duplica(movimento) {
    setBozza(bozzaDuplicata(movimento, oggiISO()));
    setModalita('duplicato');
    setAvvisoEsterno('');
    setSchedaId(null);
    avvisa('Movimento copiato nel form: controlla e registra.', 'info');
    portaAlForm();
  }

  const chiudiScheda = useCallback(() => setSchedaId(null), []);

  const lista = (
    <ListaMovimenti
      giorno={giorno}
      onCambiaGiorno={setGiorno}
      movimenti={movimenti}
      caricamento={caricamento}
      evidenziati={evidenziati}
      onApri={setSchedaId}
      onDuplica={duplica}
      mostraAnnullati={mostraAnnullati}
      onMostraAnnullati={setMostraAnnullati}
    />
  );

  return (
    <>
      {scrive ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div ref={formRef} className="scroll-mt-20">
            <FormMovimento
              bozza={bozza}
              onCambia={setBozza}
              modalita={modalita}
              onSalva={salva}
              onAnnullaModifica={() => nuovaBozza()}
              inSalvataggio={inSalvataggio}
              avvisoEsterno={avvisoEsterno}
              onRicarica={ricaricaInModifica}
              clienteRef={clienteRef}
            />
          </div>
          {lista}
        </div>
      ) : (
        <div className="mx-auto max-w-3xl">{lista}</div>
      )}

      {schedaId !== null && (
        <SchedaMovimento
          id={schedaId}
          versioneNota={versioni[schedaId]}
          onChiudi={chiudiScheda}
          onModifica={modifica}
          onDuplica={duplica}
          onCambiato={aggiornaDaServer}
        />
      )}

      {conflitto && (
        <Dialogo
          titolo="Il movimento è cambiato"
          azioni={(
            <>
              <button type="button" className="pulsante-secondario" onClick={tieniLeMieModifiche}>
                Tieni le mie modifiche
              </button>
              <button type="button" className="pulsante-primario" data-predefinito onClick={ricaricaInModifica}>
                Carica la versione aggiornata
              </button>
            </>
          )}
        >
          <p>{conflitto}</p>
          <p className="mt-2">
            Le tue modifiche <strong>non sono state salvate</strong>. Puoi caricare la versione aggiornata
            (le tue modifiche andranno perse) oppure tenerle e salvarle sopra a quelle dell'altro utente.
          </p>
        </Dialogo>
      )}
    </>
  );
}
