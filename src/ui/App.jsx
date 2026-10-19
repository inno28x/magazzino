import { useEffect, useState } from 'react';
import { configurato } from '../data/supabase.js';
import { caricaProfilo, esci, sessioneCorrente, suCambioSessione } from '../data/repository.js';
import Login from './Login.jsx';
import Applicazione from './Applicazione.jsx';
import Caricamento from './comuni/Caricamento.jsx';

export default function App() {
  if (!configurato) return <ConfigurazioneMancante />;
  return <ConSessione />;
}

function ConSessione() {
  // undefined = ancora in caricamento; null = nessuno collegato.
  const [sessione, setSessione] = useState(undefined);
  const [profilo, setProfilo] = useState(undefined);
  const [recuperoPassword, setRecuperoPassword] = useState(false);

  useEffect(() => {
    sessioneCorrente().then(setSessione).catch(() => setSessione(null));
    return suCambioSessione((evento, nuova) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperoPassword(true);
      setSessione(nuova);
    });
  }, []);

  const utenteId = sessione?.user?.id;

  useEffect(() => {
    if (!utenteId) {
      setProfilo(undefined);
      return undefined;
    }
    let valido = true;
    caricaProfilo(utenteId)
      .then((p) => { if (valido) setProfilo(p); })
      .catch(() => { if (valido) setProfilo(null); });
    return () => { valido = false; };
  }, [utenteId]);

  if (sessione === undefined) return <Caricamento />;
  if (!sessione) return <Login />;
  if (recuperoPassword) {
    return <Login modalita="nuova-password" onPasswordImpostata={() => setRecuperoPassword(false)} />;
  }
  if (profilo === undefined) return <Caricamento />;
  if (!profilo || !profilo.attivo) return <NonAbilitato />;
  return <Applicazione profilo={profilo} />;
}

function NonAbilitato() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="scheda max-w-md p-6 text-center">
        <h1 className="text-lg font-bold">Utente non abilitato</h1>
        <p className="mt-2 text-slate-600">
          Il tuo account è disattivato o non ha ancora un profilo. Chiedi all'amministratore di abilitarlo.
        </p>
        <button type="button" className="pulsante-secondario mt-5" onClick={() => esci()}>Esci</button>
      </div>
    </div>
  );
}

function ConfigurazioneMancante() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="scheda max-w-lg p-6">
        <h1 className="text-lg font-bold">Collegamento al database non configurato</h1>
        <p className="mt-2 text-slate-600">
          Mancano le variabili <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> e{' '}
          <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_KEY</code>. Inseriscile nelle impostazioni
          del sito su Cloudflare (o nel file <code className="rounded bg-slate-100 px-1">.env.local</code> in
          locale) e pubblica di nuovo. Vedi il README, passo 6.
        </p>
      </div>
    </div>
  );
}
