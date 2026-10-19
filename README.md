# Magazzino biancheria

Registro dei movimenti del magazzino biancheria: ogni giorno si registrano i
capi che **escono** verso i clienti e quelli che **rientrano**, con causale,
articoli e quantità. Più postazioni lavorano insieme e vedono gli aggiornamenti
in tempo reale.

- **Database, accesso e tempo reale:** [Supabase](https://supabase.com) (piano gratuito, server a Francoforte)
- **Sito:** [Cloudflare Pages](https://pages.cloudflare.com) (piano gratuito, uso aziendale consentito)
- **Costo:** zero. Limiti e motivazioni in [`docs/PROGETTO.md`](docs/PROGETTO.md), § 6.

## Stato dello sviluppo

| Fase | Contenuto | Stato |
|------|-----------|-------|
| 1 | Schema del database, permessi, accesso | ✅ fatto |
| 2 | Schermata **Oggi**: registrazione, modifica, duplicazione, annullamento, storico modifiche, tempo reale | ✅ fatto |
| 3 | Registro storico con filtri ed export Excel | da fare |
| 4 | Statistiche e grafici, punteggio clienti problematici | da fare |
| 5 | Anagrafiche con import, utenti, impostazioni, backup | da fare |

Finché la fase 5 non è pronta, clienti, articoli e utenti si inseriscono dal
pannello di Supabase (passi 5 e 8). Per provare l'app senza dati reali ci sono i
dati demo (passo 9).

---

## Messa in funzione, passo per passo

Servono circa 30 minuti. Non serve installare nulla sul computer: si fa tutto dal browser.

### 1. Account

Ti servono tre account gratuiti, tutti accessibili con lo stesso account GitHub:

- **GitHub** — dove sta il codice (ce l'hai già);
- **Supabase** — vai su [supabase.com](https://supabase.com) → *Start your project* → *Continue with GitHub*;
- **Cloudflare** — vai su [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) e registrati con email e password.

### 2. Crea il progetto Supabase

1. In Supabase: **New project**.
2. Compila:
   - *Name*: `magazzino-biancheria`
   - *Database Password*: premi *Generate a password* e **salvala** in un posto sicuro (gestore password)
   - *Region*: **Central EU (Frankfurt)**
   - *Plan*: **Free**
3. **Create new project** e attendi un paio di minuti che sia pronto.

### 3. Crea le tabelle (script SQL)

1. Nel menu a sinistra di Supabase apri **SQL Editor**.
2. Premi **+** → *New SQL snippet* (o *New query*).
3. Apri il file [`supabase/01_schema.sql`](supabase/01_schema.sql) di questo repository, premi il pulsante
   *Copy raw file* (le due pagine sovrapposte, in alto a destra) e incolla tutto nell'editor.
4. Premi **Run** (o Ctrl+Invio). Deve comparire *Success. No rows returned*.

Lo script va eseguito **una volta sola**. Se lo lanci una seconda volta ottieni
errori del tipo *already exists*: è normale, il database è già pronto.

### 4. Chiudi la registrazione libera

Gli utenti li crea solo l'amministratore.

1. Menu **Authentication** → **Sign In / Providers** (in alcune versioni: *Providers* o *Settings*).
2. Disattiva **Allow new users to sign up** e salva.

### 5. Crea il primo amministratore

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Inserisci la tua email e una password, spunta **Auto Confirm User**, premi **Create user**.
3. Torna nello **SQL Editor**, nuova query, incolla (cambiando nome ed email) e premi **Run**:

   ```sql
   update public.profili
   set ruolo = 'admin', nome = 'Nome Cognome'
   where email = 'tua@email.it';
   ```

4. Controllo: `select nome, email, ruolo from public.profili;` deve mostrarti come `admin`.

### 6. Copia i due codici di collegamento

1. In Supabase apri **Project Settings** (ingranaggio in basso a sinistra) → **API Keys**.
2. Copia la **Publishable key** (inizia con `sb_publishable_`). Se vedi solo le chiavi "legacy",
   va bene anche quella chiamata **anon public**.
3. Sempre in Project Settings, apri **Data API** (o la pagina principale del progetto) e copia il
   **Project URL** (`https://xxxx.supabase.co`).

> ⚠️ Non usare mai la chiave **secret** / **service_role**: dà accesso a tutto senza controlli.
> La publishable key invece è fatta per stare nel sito: le regole di sicurezza del database
> (passo 3) decidono cosa può fare ciascun utente.

### 7. Pubblica il sito su Cloudflare Pages

1. In Cloudflare: menu **Compute (Workers & Pages)** → **Create** → scheda **Pages** →
   **Import an existing Git repository** (se vedi solo "Workers", cerca il link *Looking to deploy Pages? Get started*).
2. Collega GitHub e scegli il repository **magazzino**.
3. Impostazioni di build:
   - *Production branch*: `main`
   - *Framework preset*: **React (Vite)** (oppure *None*)
   - *Build command*: `npm run build`
   - *Build output directory*: `dist`
4. Apri **Environment variables (advanced)** e aggiungi:

   | Nome | Valore |
   |------|--------|
   | `VITE_SUPABASE_URL` | il Project URL del passo 6 |
   | `VITE_SUPABASE_KEY` | la Publishable key del passo 6 |
   | `NODE_VERSION` | `22` |

5. **Save and Deploy**. Dopo un paio di minuti il sito è online su un indirizzo tipo
   `https://magazzino-xxx.pages.dev`. Aprilo, accedi con l'utente del passo 5.

Ogni volta che il codice su `main` cambia, Cloudflare ripubblica il sito da solo.

### 8. Indirizzo del sito in Supabase e altri utenti

1. Supabase → **Authentication** → **URL Configuration**: in *Site URL* metti l'indirizzo del
   sito (`https://magazzino-xxx.pages.dev`) e aggiungilo anche in *Redirect URLs*. Serve per i
   link "password dimenticata".
2. Per ogni collega: **Authentication** → **Users** → **Add user** (come al passo 5), poi nel SQL Editor:

   ```sql
   update public.profili set ruolo = 'operatore', nome = 'Mario Rossi' where email = 'mario@esempio.it';
   ```

   Ruoli possibili: `admin`, `operatore`, `lettura`. Per disattivare un utente senza perdere lo
   storico: `update public.profili set attivo = false where email = '...';`

### 9. Dati demo (facoltativo)

Per provare l'app con 15 clienti, 30 articoli e 3 mesi di movimenti inventati, nel SQL Editor:

```sql
select public.genera_dati_demo();
```

Per toglierli prima di iniziare a lavorare sul serio:

```sql
select public.cancella_dati_demo();
```

I dati demo hanno codici cliente 990001–990015 e articoli che iniziano per `DEMO-`. Il generatore
non parte se ci sono già movimenti reali.

### 10. Clienti e articoli reali

In attesa della schermata Anagrafiche con import CSV/Excel (fase 5) si possono caricare da
Supabase: **Table Editor** → tabella `clienti` (o `articoli`) → **Insert** → *Import data from CSV*.
Colonne:

- `clienti`: `codice`, `ragione_sociale`, `struttura`, `zona` (il gruppo si collega dopo);
- `articoli`: `codice`, `descrizione`, `categoria` (una tra `federe`, `lenzuola`, `copripiumini`,
  `sovrapiumini`, `spugna`, `tovagliato`, `altro`). I codici che finiscono per **T** vengono
  segnati come RFID in automatico.

---

## Cose da sapere sul piano gratuito

- **Pausa per inattività.** Un progetto Supabase gratuito che resta 7 giorni senza alcun
  accesso viene messo in pausa. Con l'uso quotidiano non succede. Se capita (es. chiusura
  per ferie), da Supabase si preme **Restore project**: i dati restano intatti.
- **Backup.** Il piano gratuito non include backup automatici. Nella fase 5 arriveranno
  l'export completo dall'app e un backup notturno automatico (gratuito) su GitHub.
  Fino ad allora, per sicurezza: Supabase → **Table Editor** → ogni tabella → *Export to CSV*.
- **Spazio.** 500 MB di database bastano per molti anni di movimenti.

## Permessi

| Ruolo | Cosa può fare |
|-------|---------------|
| **Amministratore** | Tutto: anagrafiche, utenti, impostazioni, annullamento e ripristino dei movimenti |
| **Operatore** | Registra movimenti; modifica solo i propri, entro 7 giorni dalla registrazione (configurabile); consulta tutto |
| **Sola lettura** | Consulta movimenti e statistiche |

Le regole sono applicate **dal database** (Row Level Security), non solo nascondendo i pulsanti.
I movimenti non si cancellano mai: si annullano con un motivo e restano nello storico, e ogni
creazione, modifica o annullamento è registrato con autore, data e valori prima/dopo.

---

## Per chi sviluppa

```bash
npm install
cp .env.example .env.local   # inserisci URL e chiave del progetto Supabase
npm run dev                  # http://localhost:5173
npm test                     # test della logica (Node ≥ 20)
npm run test:db              # test dello schema su un PostgreSQL locale (serve PostgreSQL ≥ 15)
```

Struttura:

```
supabase/01_schema.sql   schema, permessi (RLS), audit, funzioni, dati demo
supabase/test/           test dello schema su PostgreSQL locale
src/data/tipi.js         modello dati: tipi e costanti
src/data/repository.js   UNICO punto di accesso al database
src/data/movimento.js    regole sui movimenti (validazione, totali, permessi), senza database
src/data/ricerca.js      ricerca clienti e articoli
src/lib/formato.js       numeri e date all'italiana, fuso Europe/Rome
src/ui/                  schermate React
docs/PROGETTO.md         progetto approvato
```
