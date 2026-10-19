import { useState } from 'react';
import { accedi, impostaPassword, inviaResetPassword } from '../data/repository.js';

/**
 * Accesso con email e password. Nessuna registrazione: gli utenti li crea l'admin.
 * modalita: "accesso" | "recupero" (invio email) | "nuova-password" (dal link ricevuto)
 */
export default function Login({ modalita: iniziale = 'accesso', onPasswordImpostata }) {
  const [modalita, setModalita] = useState(iniziale);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const [attesa, setAttesa] = useState(false);

  async function invia(e) {
    e.preventDefault();
    setErrore('');
    setMessaggio('');
    setAttesa(true);
    try {
      if (modalita === 'accesso') {
        await accedi(email, password);
      } else if (modalita === 'recupero') {
        await inviaResetPassword(email);
        setMessaggio('Se l\'indirizzo è registrato, riceverai un\'email con il link per scegliere una nuova password.');
      } else {
        if (password.length < 8) throw new Error('La password deve avere almeno 8 caratteri.');
        if (password !== conferma) throw new Error('Le due password non coincidono.');
        await impostaPassword(password);
        onPasswordImpostata?.();
      }
    } catch (err) {
      setErrore(err.message);
    } finally {
      setAttesa(false);
    }
  }

  const titoli = {
    accesso: 'Accedi',
    recupero: 'Password dimenticata',
    'nuova-password': 'Scegli una nuova password',
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={invia} className="scheda w-full max-w-sm p-6" noValidate>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Magazzino biancheria</p>
        <h1 className="mb-5 text-2xl font-bold">{titoli[modalita]}</h1>

        {modalita !== 'nuova-password' && (
          <div className="mb-4">
            <label htmlFor="email" className="etichetta">Email</label>
            <input id="email" type="email" className="campo" autoComplete="username" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        )}

        {modalita !== 'recupero' && (
          <div className="mb-4">
            <label htmlFor="password" className="etichetta">
              {modalita === 'nuova-password' ? 'Nuova password' : 'Password'}
            </label>
            <input id="password" type="password" className="campo" required
              autoComplete={modalita === 'accesso' ? 'current-password' : 'new-password'}
              autoFocus={modalita === 'nuova-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}

        {modalita === 'nuova-password' && (
          <div className="mb-4">
            <label htmlFor="conferma" className="etichetta">Ripeti la password</label>
            <input id="conferma" type="password" className="campo" autoComplete="new-password" required
              value={conferma} onChange={(e) => setConferma(e.target.value)} />
          </div>
        )}

        {errore && <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-800" role="alert">{errore}</p>}
        {messaggio && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-emerald-900">{messaggio}</p>}

        <button type="submit" className="pulsante-primario w-full" disabled={attesa}>
          {attesa ? 'Attendere…' : { accesso: 'Accedi', recupero: 'Invia il link', 'nuova-password': 'Salva password' }[modalita]}
        </button>

        {modalita === 'accesso' && (
          <button type="button" className="mt-3 w-full py-2 text-sm text-slate-600 underline"
            onClick={() => { setModalita('recupero'); setErrore(''); }}>
            Password dimenticata?
          </button>
        )}
        {modalita === 'recupero' && (
          <button type="button" className="mt-3 w-full py-2 text-sm text-slate-600 underline"
            onClick={() => { setModalita('accesso'); setErrore(''); setMessaggio(''); }}>
            Torna all'accesso
          </button>
        )}
      </form>
    </div>
  );
}
