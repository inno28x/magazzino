# Registro Magazzino Biancheria — proposta di progetto

> Documento per approvazione. Niente codice finché schema, permessi e schermate
> non sono confermati. Le decisioni ancora aperte sono in fondo (§ 7).

## 0. Premessa: quale stack

La richiesta contiene due sezioni "Stack". Questa proposta segue la **seconda**
(Supabase + Vercel), che sostituisce la prima versione localStorage. Di
conseguenza:

| Prima versione (localStorage)            | Questa versione (Supabase)                                   |
|------------------------------------------|--------------------------------------------------------------|
| Persistenza su localStorage              | Postgres su Supabase, region EU (Francoforte)                |
| Lista operatori in impostazioni          | Utenti Supabase Auth; l'operatore è l'utente loggato          |
| Backup/import JSON in locale             | Export completo JSON + Excel dall'admin; backup Supabase     |
| Cancellazione fisica con conferma        | Annullamento logico con motivo obbligatorio + audit          |
| Dati demo in localStorage                | Dati demo marcati `demo = true`, cancellabili in un colpo    |

Restano invariati: React + Vite + Tailwind, Recharts, SheetJS, interfaccia in
italiano (1.234,56 — gg/mm/aaaa), uso da tablet.

---

## 1. Schema del database

### 1.1 Diagramma delle relazioni

```
auth.users 1──1 profili ──────────────┐ (operatore, chi modifica, chi annulla)
                                      │
gruppi 1──N clienti 1──N movimenti N──┘
                              │ 1
                              │
                              N
articoli 1──────────N movimento_righe

movimenti 1──N audit_movimenti N──1 profili
impostazioni (una sola riga)
```

### 1.2 Tipi enumerati

| Tipo         | Valori                                                                                   |
|--------------|------------------------------------------------------------------------------------------|
| `ruolo`      | `admin`, `operatore`, `lettura`                                                          |
| `direzione`  | `USCITA`, `ENTRATA`                                                                      |
| `causale`    | `AUMENTO_DOTAZIONE`, `REINTEGRO_INVENTARIO`, `RITIRO_DOTAZIONE`, `RITIRO_INVENTARIO`, `ALTRO` |
| `categoria`  | `federe`, `lenzuola`, `copripiumini`, `sovrapiumini`, `spugna`, `tovagliato`, `altro`    |
| `stato_mov`  | `attivo`, `annullato`                                                                    |

Coerenza direzione/causale garantita da un vincolo `CHECK`:
USCITA ⇒ AUMENTO_DOTAZIONE | REINTEGRO_INVENTARIO | ALTRO;
ENTRATA ⇒ RITIRO_DOTAZIONE | RITIRO_INVENTARIO | ALTRO.

### 1.3 Tabelle

**`profili`** — un profilo per ogni utente di Supabase Auth

| Campo        | Tipo          | Note                                              |
|--------------|---------------|---------------------------------------------------|
| `id`         | uuid PK       | = `auth.users.id`, `ON DELETE CASCADE`            |
| `email`      | text          | copiata da Auth, solo per visualizzazione         |
| `nome`       | text NOT NULL | nome mostrato come "operatore"                    |
| `ruolo`      | ruolo         | default `lettura`                                 |
| `attivo`     | bool          | default true; un utente disattivato non vede nulla |
| `created_at` | timestamptz   |                                                   |

Un trigger su `auth.users` crea il profilo automaticamente (ruolo `lettura`):
chi viene creato senza ruolo non può fare danni.

**`gruppi`** — catene alberghiere

| Campo  | Tipo                 | Note                        |
|--------|----------------------|-----------------------------|
| `id`   | bigint identity PK   |                             |
| `nome` | text UNIQUE NOT NULL | es. "Gruppo UNA", "Starhotels" |

Tabella separata (e non testo libero sul cliente) perché "Starhotels" e
"StarHotels" finirebbero in due gruppi diversi nelle statistiche. All'import
CSV il gruppo viene cercato per nome (senza badare a maiuscole) e creato se manca.

**`clienti`**

| Campo             | Tipo                    | Note                                          |
|-------------------|-------------------------|-----------------------------------------------|
| `codice`          | integer PK              | codice del gestionale: è la chiave            |
| `ragione_sociale` | text NOT NULL           | **non** univoca (catene con più strutture)    |
| `struttura`       | text NOT NULL           | nome della struttura                          |
| `gruppo_id`       | bigint FK → gruppi null | opzionale                                     |
| `zona`            | text                    | es. "Versilia", "Firenze", "Chianti"          |
| `attivo`          | bool default true       | i non attivi non compaiono nel form rapido    |
| `demo`            | bool default false      | dati di prova                                 |
| `created_at`, `updated_at` | timestamptz    |                                               |

**`articoli`**

| Campo            | Tipo                | Note                                                  |
|------------------|---------------------|-------------------------------------------------------|
| `codice`         | text PK             | es. `FED5080`, `FED5080T`                              |
| `descrizione`    | text NOT NULL       |                                                       |
| `categoria`      | categoria NOT NULL  |                                                       |
| `peso_kg`        | numeric(8,3) ≥ 0    | peso stimato unitario                                 |
| `costo_unitario` | numeric(10,2) ≥ 0   | costo d'acquisto €                                    |
| `rfid`           | bool                | proposto in automatico se il codice finisce per `T`, modificabile |
| `codice_base`    | text **generato**   | `rfid ? codice senza T finale : codice` → usato da "aggrega varianti RFID" |
| `attivo`         | bool default true   |                                                       |
| `demo`           | bool default false  |                                                       |
| `created_at`, `updated_at` | timestamptz |                                                    |

`FED5080` e `FED5080T` restano due articoli distinti con prezzi e pesi propri;
nelle statistiche, con l'interruttore "aggrega varianti RFID", si raggruppa per
`codice_base`. Il flag `rfid` è un campo vero (non dedotto ogni volta dal codice)
per non sbagliare su eventuali codici che finiscono per T senza essere RFID.

**`movimenti`** — la bolla (testata)

| Campo              | Tipo                         | Note                                                   |
|--------------------|------------------------------|--------------------------------------------------------|
| `id`               | bigint identity PK           | numero interno progressivo, mostrato come "Mov. n°"    |
| `data`             | date NOT NULL                | default oggi (fuso Europe/Rome)                        |
| `direzione`        | direzione NOT NULL           |                                                        |
| `causale`          | causale NOT NULL             | CHECK coerenza con la direzione                        |
| `cliente_codice`   | integer FK → clienti NOT NULL | `ON UPDATE CASCADE`, `ON DELETE RESTRICT`             |
| `numero_bolla`     | text null                    | normalizzato (spazi tolti, maiuscolo); univocità § 1.5 |
| `richiesto_da`     | text null                    | referente del cliente                                  |
| `note`             | text null                    |                                                        |
| `operatore_id`     | uuid FK → profili NOT NULL   | impostato **dal database** = utente loggato, non modificabile |
| `stato`            | stato_mov default `attivo`   |                                                        |
| `motivo_annullamento` | text null                 | obbligatorio se `stato = annullato` (CHECK)            |
| `annullato_da`     | uuid FK → profili null       |                                                        |
| `annullato_il`     | timestamptz null             |                                                        |
| `versione`         | integer default 1            | per il controllo dei salvataggi concorrenti (§ 1.6)    |
| `created_at`       | timestamptz default now()    | non modificabile                                       |
| `updated_at`       | timestamptz                  | data dell'ultima modifica                              |
| `updated_by`       | uuid FK → profili            |                                                        |
| `demo`             | bool default false           |                                                        |

**`movimento_righe`** — le righe articolo della bolla

| Campo             | Tipo                               | Note                                      |
|-------------------|------------------------------------|-------------------------------------------|
| `id`              | bigint identity PK                 |                                           |
| `movimento_id`    | bigint FK → movimenti NOT NULL     | `ON DELETE CASCADE`                       |
| `articolo_codice` | text FK → articoli NOT NULL        | `ON UPDATE CASCADE`, `ON DELETE RESTRICT` |
| `quantita`        | integer NOT NULL CHECK (> 0)       | niente zero o negativi, anche da database |
| `peso_kg`         | numeric(8,3)                       | **fotografia** del peso al momento della registrazione |
| `costo_unitario`  | numeric(10,2)                      | **fotografia** del costo al momento della registrazione |
| UNIQUE (`movimento_id`, `articolo_codice`) |           | lo stesso articolo una volta sola per bolla (le quantità si sommano) |

Perché la fotografia di peso e costo: se a marzo il costo di una federa passa da
3,20 € a 3,60 €, i reintegri di gennaio devono restare valorizzati a 3,20 €.
Un trigger copia i valori dall'anagrafica all'inserimento della riga (vedi § 7,
domanda 3).

**`audit_movimenti`** — tracciabilità, scritta solo dai trigger

| Campo          | Tipo                 | Note                                                        |
|----------------|----------------------|-------------------------------------------------------------|
| `id`           | bigint identity PK   |                                                             |
| `movimento_id` | bigint NOT NULL      | niente FK: l'audit sopravvive anche alla pulizia dei dati demo |
| `azione`       | text                 | `creazione`, `modifica`, `annullamento`, `ripristino`       |
| `utente_id`    | uuid                 | `auth.uid()` di chi ha agito                                |
| `eseguito_il`  | timestamptz          |                                                             |
| `prima`        | jsonb null           | testata + righe **prima** (null alla creazione)             |
| `dopo`         | jsonb                | testata + righe **dopo**                                    |

Un salvataggio (testata + righe) produce **una sola** riga di audit con la
fotografia completa prima/dopo: nella scheda del movimento si legge "Mario
Rossi, 14/10/2026 10:32 — FED5080: 20 → 30; aggiunto TOV1818T × 10".
Nessun utente, nemmeno l'admin, può scrivere o cancellare l'audit dall'app.

**`impostazioni`** — una sola riga (`id = 1`)

| Campo                       | Default | Note                                       |
|-----------------------------|---------|--------------------------------------------|
| `finestra_modifica_giorni`  | 7       | quanto a lungo l'operatore può modificare i propri movimenti |
| `peso_valore`               | 50      | pesi del punteggio "cliente problematico"  |
| `peso_frequenza`            | 25      |                                            |
| `peso_saldo`                | 25      |                                            |
| `soglia_allerta`            | 60      | punteggio oltre il quale il cliente è rosso |
| `giorni_avviso_backup`      | 7       |                                            |
| `ultimo_backup_il`          | null    | aggiornato a ogni export completo          |
| `ultimo_backup_da`          | null    |                                            |

### 1.4 Indici

| Tabella           | Indice                                               | Serve a                                   |
|-------------------|------------------------------------------------------|-------------------------------------------|
| `movimenti`       | `(data DESC)`                                        | schermata Oggi, registro, filtri periodo  |
| `movimenti`       | `(cliente_codice, data)`                             | scheda cliente, classifica, frequenze     |
| `movimenti`       | `(operatore_id, created_at)`                         | "i miei movimenti modificabili"           |
| `movimenti`       | `(causale, data)`                                    | statistiche reintegri                     |
| `movimenti`       | UNIQUE parziale su numero bolla (§ 1.5)              | univocità bolle                           |
| `movimento_righe` | `(movimento_id)`                                     | caricamento righe di una bolla            |
| `movimento_righe` | `(articolo_codice)`                                  | analisi articoli, filtro registro         |
| `clienti`         | `(gruppo_id)`                                        | vista per gruppo                          |
| `audit_movimenti` | `(movimento_id, eseguito_il)`                        | storico nella scheda movimento            |

Clienti (~140) e articoli (qualche centinaio) vengono caricati interi
all'avvio: la ricerca con autocompletamento gira nel browser, istantanea anche
con rete del magazzino lenta.

### 1.5 Univocità dei numeri bolla

Indice univoco parziale su `(direzione, anno della data, numero_bolla)` solo per
i movimenti **attivi** con numero bolla compilato. Effetti:

- il form controlla mentre si digita ("Bolla 1234 già usata il 12/10 per Hotel X")
  e lo ripete al salvataggio;
- anche se due persone salvano la stessa bolla nello stesso secondo, il database
  ne accetta una sola: il secondo riceve l'avviso, non un duplicato;
- una bolla annullata libera il suo numero;
- USCITA ed ENTRATA hanno numerazioni separate (le bolle di rientro spesso sono
  documenti del cliente); la numerazione riparte ogni anno.

### 1.6 Modifiche simultanee (controllo di versione)

Ogni movimento ha un campo `versione`. Il salvataggio passa per la funzione
`salva_movimento(id, versione_letta, testata, righe)`, che in un'unica
transazione:

1. verifica che `versione` nel database sia ancora quella letta; se no, si
   ferma con l'errore `MOVIMENTO_CAMBIATO`;
2. aggiorna testata e righe insieme (mai una bolla a metà);
3. incrementa `versione`, aggiorna `updated_at`/`updated_by`;
4. scrive l'audit.

L'app mostra: *"Questo movimento è stato modificato da Laura Bianchi alle
10:41 mentre lo stavi modificando. [Vedi le differenze] [Ricarica] [Annulla]"*.
Nessuna sovrascrittura silenziosa. La funzione gira con i permessi
dell'utente (`SECURITY INVOKER`), quindi le regole RLS valgono anche lì.

### 1.7 Funzioni e viste di supporto

| Oggetto                              | Tipo      | Scopo                                                         |
|--------------------------------------|-----------|---------------------------------------------------------------|
| `ruolo_corrente()`                   | funzione  | ruolo dell'utente loggato (null se disattivato); usata dalle policy |
| `puo_modificare_movimento(id)`       | funzione  | la regola "propri, attivi, entro N giorni" in un solo punto    |
| `salva_movimento(...)`               | funzione  | creazione/modifica atomica con controllo versione              |
| `annulla_movimento(id, versione, motivo)` | funzione | annullamento logico                                        |
| `v_righe`                            | vista     | riga + testata + cliente + gruppo + articolo, con kg e € già calcolati; base di registro ed export |
| `stat_kpi`, `stat_andamento`, `stat_clienti`, `stat_articoli`, `stat_gruppi`, `stat_cliente` | funzioni | aggregati per periodo calcolati nel database, così il tablet riceve poche righe invece di migliaia |
| `cancella_dati_demo()`               | funzione  | solo admin: elimina tutto ciò che ha `demo = true`             |

Le statistiche escludono sempre i movimenti annullati. Tutte le viste e funzioni
statistiche rispettano RLS (`security_invoker`).

---

## 2. Permessi e Row Level Security

RLS è attiva su **tutte** le tabelle. Senza una policy che lo consenta, il
database rifiuta: nascondere un pulsante è solo comodità, la regola vera è nel
database. Le cancellazioni fisiche non sono consentite a nessuno sulle tabelle
dei movimenti.

### 2.1 Matrice per ruolo

| Tabella / azione            | ADMIN                 | OPERATORE                                              | LETTURA |
|-----------------------------|-----------------------|--------------------------------------------------------|---------|
| `profili` lettura           | tutti                 | solo il proprio + nomi degli altri (per "operatore")   | come operatore |
| `profili` scrittura         | sì (ruolo, attivo, nome) | no (nemmeno il proprio ruolo)                       | no      |
| `gruppi`/`clienti`/`articoli` lettura | sì          | sì                                                     | sì      |
| `gruppi`/`clienti`/`articoli` scrittura | sì        | no                                                     | no      |
| `movimenti` lettura attivi  | sì                    | sì                                                     | sì      |
| `movimenti` lettura annullati | sì                  | no                                                     | no      |
| `movimenti` inserimento     | sì                    | sì                                                     | no      |
| `movimenti` modifica        | tutti                 | solo propri, attivi, creati da ≤ N giorni (default 7)  | no      |
| `movimenti` annullamento    | sì                    | vedi § 7, domanda 1                                    | no      |
| `movimenti` cancellazione fisica | no              | no                                                     | no      |
| `movimento_righe`           | segue la testata      | segue la testata                                       | lettura |
| `audit_movimenti` lettura   | tutto                 | audit dei movimenti che può vedere                     | idem    |
| `audit_movimenti` scrittura | no (solo trigger)     | no                                                     | no      |
| `impostazioni` lettura      | sì                    | sì (servono pesi e soglia per i grafici)               | sì      |
| `impostazioni` scrittura    | sì                    | no                                                     | no      |
| Creazione utenti            | sì (§ 2.4)            | no                                                     | no      |

### 2.2 Policy (in linguaggio naturale; lo SQL arriva dopo l'approvazione)

- **Lettura di base** — ogni tabella: consentita se `ruolo_corrente()` non è null
  (utente esistente e attivo).
- **`movimenti` SELECT** — `stato = 'attivo' OR ruolo_corrente() = 'admin'`.
- **`movimenti` INSERT** — ruolo admin o operatore, `operatore_id = auth.uid()`,
  `stato = 'attivo'`.
- **`movimenti` UPDATE** — admin sempre; operatore se
  `operatore_id = auth.uid() AND stato = 'attivo' AND created_at >= now() − finestra`.
  La finestra si conta dalla **registrazione**, non dalla data del movimento,
  così retrodatare un movimento non allunga la possibilità di modificarlo.
- **`movimento_righe` INSERT/UPDATE/DELETE** — consentite solo se
  `puo_modificare_movimento(movimento_id)`; SELECT se la testata è visibile.
- **Anagrafiche e `impostazioni`** INSERT/UPDATE/DELETE — solo
  `ruolo_corrente() = 'admin'`. Un cliente o articolo usato in almeno un
  movimento non si può cancellare (vincolo FK): si disattiva.

### 2.3 Regole che RLS da sola non può esprimere → trigger

RLS decide *se* puoi modificare una riga, non *quali campi*. Un trigger
`BEFORE UPDATE` su `movimenti` completa le regole:

- `operatore_id`, `created_at`, `id` non cambiano mai;
- solo l'admin può passare a `annullato` o ripristinare (salvo diversa decisione
  sulla domanda 1), e il motivo è obbligatorio;
- `updated_at`, `updated_by`, `versione` li imposta il database, non il browser.

Un trigger `BEFORE INSERT` imposta `operatore_id = auth.uid()` ignorando
qualunque valore inviato dal browser.

### 2.4 Creazione degli utenti

- In Supabase si **disattiva la registrazione libera** (istruzioni nel README).
- Il **primo admin** si crea dal pannello di Supabase (Authentication → Add user)
  e si promuove con una riga SQL già pronta nel README.
- Gli utenti successivi li crea l'admin **dall'app** (schermata Utenti). Creare
  utenti richiede la chiave segreta `service_role`, che non deve mai arrivare
  al browser: la creazione passa da una piccola funzione server su Vercel
  (`/api/utenti`) che legge la chiave da una variabile d'ambiente privata e
  accetta la richiesta solo se chi la fa è admin. Si pubblica insieme al sito,
  senza passaggi in più.

### 2.5 Tempo reale

`movimenti` e `movimento_righe` vengono aggiunte alla pubblicazione Realtime.
Supabase Realtime rispetta RLS: ognuno riceve solo gli eventi delle righe che
può vedere (es. gli annullamenti arrivano solo all'admin). Su un evento, l'app
ricarica quel singolo movimento e aggiorna la lista "Oggi" o il registro, con
un breve evidenziamento della riga cambiata. Se il movimento aperto in modifica
cambia, compare subito un avviso, prima ancora del salvataggio.

---

## 3. Punteggio "cliente problematico" (0–100)

Calcolato sul periodo selezionato, solo con movimenti attivi. Tre componenti,
ognuna da 0 a 100 rispetto al cliente "peggiore" del periodo:

| Componente | Formula                                                                 |
|------------|-------------------------------------------------------------------------|
| **V** Valore reintegrato | € in REINTEGRO INVENTARIO del cliente ÷ massimo tra i clienti × 100 |
| **F** Frequenza richieste | n° movimenti del cliente nel periodo ÷ massimo tra i clienti × 100 |
| **S** Crescita saldo | saldo netto in € (uscite − entrate) se positivo, ÷ massimo × 100; saldo ≤ 0 → 0 |

**Punteggio = (V × peso_V + F × peso_F + S × peso_S) ÷ (peso_V + peso_F + peso_S)**

Pesi di default 50 / 25 / 25, soglia 60, tutti modificabili dall'admin.
Ogni punteggio ha un pulsante "Come è calcolato" con i numeri veri:

```
Hotel Principe di Piemonte (cod. 10234) — periodo 01/07–30/09/2026
V  Reintegri  4.812,40 € su massimo 6.150,00 €  → 78   × 50
F  Richieste  23 su massimo 31                  → 74   × 25
S  Saldo     +1.920,00 € su massimo 2.400,00 €  → 80   × 25
Punteggio = (78×50 + 74×25 + 80×25) ÷ 100 = 78  ▲ sopra soglia 60
```

Il saldo è in € (non in pezzi) perché 100 federe e 100 copripiumini non pesano
uguale. Il riferimento al "massimo" rende il punteggio leggibile ("il peggiore
fa 100"), con un limite noto: un cliente fuori scala schiaccia gli altri verso
il basso. Si può valutare più avanti un riferimento al 95° percentile.

---

## 4. Schermate

Barra in alto: Oggi · Registro · Statistiche · (admin) Anagrafiche · Utenti ·
Impostazioni · menu utente. Su tablet: pulsanti alti almeno 48 px, tastierino
numerico per le quantità, tutto il form rapido usabile senza mouse.

| # | Schermata | Contenuto | Ruoli |
|---|-----------|-----------|-------|
| 1 | **Login** | email + password, "password dimenticata" (mail di Supabase). Nessuna registrazione | tutti |
| 2 | **Oggi** (home) | A sinistra il form rapido: data (oggi), USCITA/ENTRATA a due grandi pulsanti, cliente con ricerca per codice o nome, causale a pulsanti (solo quelle valide per la direzione), n° bolla con controllo duplicati, richiesto da, note; righe articolo con autocompletamento — Invio aggiunge la riga e torna sul campo articolo. A destra la lista dei movimenti del giorno in tempo reale, con totali pezzi/kg/€ entrate e uscite. Ogni movimento: apri, duplica, modifica (se consentito). Per LETTURA: solo la lista | operatore, admin (lettura: solo lista) |
| 3 | **Scheda movimento** (pannello laterale) | testata, righe con kg ed €, operatore, creato/modificato il, storico modifiche con differenze prima/dopo; pulsanti Modifica, Duplica, Annulla (con motivo) secondo i permessi | tutti (azioni secondo ruolo) |
| 4 | **Registro** | tabella paginata di tutti i movimenti, filtri: date, cliente, gruppo, direzione, causale, articolo, categoria, operatore; per admin anche "mostra annullati". Totali pezzi/kg/€ sui filtri attivi. Export .xlsx della vista filtrata, una riga per riga-articolo. Vista "per bolla" o "per riga" | tutti |
| 5 | **Statistiche — Dashboard** | filtro periodo globale (settimana, mese, trimestre, anno, personalizzato) valido per tutte le schede statistiche; KPI: movimenti, pezzi usciti, pezzi entrati, saldo netto, € reintegrato; linee uscite vs entrate per giorno/settimana; barre impilate per causale. Interruttore pezzi / kg / € e "aggrega varianti RFID" | tutti |
| 6 | **Statistiche — Clienti problematici** | tabella ordinabile: n° richieste, giorni medi tra richieste, pezzi ed € reintegro, saldo netto, quota sul totale reintegri, trend vs periodo precedente (▲▼ %), punteggio con spiegazione, righe rosse sopra soglia. Grafici: top 10 € reintegrato (barre orizzontali), curva di Pareto con "N clienti fanno l'80% dei reintegri" | tutti |
| 7 | **Scheda cliente** | anagrafica, punteggio, storico movimenti, andamento mensile entrate/uscite, articoli più richiesti, mix causali, saldo cumulato nel tempo per articolo (scelta articoli) | tutti |
| 8 | **Statistiche — Articoli** | più movimentati, più reintegrati; cliccando un articolo, i clienti che lo reintegrano di più | tutti |
| 9 | **Statistiche — Gruppi** | stesse metriche della classifica clienti aggregate per catena, con confronto tra catene e dettaglio delle strutture del gruppo | tutti |
| 10 | **Anagrafiche** | schede Clienti · Articoli · Gruppi: elenco con ricerca, crea/modifica/disattiva. Import CSV/Excel con anteprima prima di confermare (nuovi, modificati, errori riga per riga), aggiornamento per codice | admin |
| 11 | **Utenti** | elenco utenti, crea (email, nome, ruolo, password iniziale), cambia ruolo, disattiva, invia reset password | admin |
| 12 | **Impostazioni** | finestra di modifica operatori; pesi e soglia del punteggio con anteprima dell'effetto; backup: export completo JSON ed Excel, data dell'ultimo backup (avviso in alto per l'admin oltre 7 giorni); dati demo: genera / cancella | admin |
| 13 | **Profilo** | nome, cambio password | tutti |

### 4.1 Dati demo

Da Impostazioni, solo admin: 15 clienti (alcuni nella stessa catena, con la
stessa ragione sociale e codici diversi), 30 articoli tipici con pesi e costi
plausibili e coppie con/senza T, 3 mesi di movimenti con andamenti realistici
(stagionalità, 2–3 clienti chiaramente "problematici"). Tutto marcato
`demo = true`; "Cancella dati demo" toglie solo quelli. Il generatore si rifiuta
di partire se esistono già movimenti reali.

---

## 5. Backup

- **Dall'app (admin):** export completo in un file JSON (ricaricabile) e in un
  file Excel con un foglio per tabella: gruppi, clienti, articoli, movimenti,
  righe, audit, utenti (senza password). Ogni export aggiorna "ultimo backup".
- **Supabase:** nel README le istruzioni su come verificare e attivare i backup
  automatici giornalieri del progetto. Nota importante da verificare al momento
  della creazione: i backup automatici giornalieri sono inclusi nei piani a
  pagamento, mentre il piano gratuito ha limiti (backup e messa in pausa dei
  progetti inattivi). Per uno strumento di lavoro quotidiano consiglierò il piano
  Pro; il README dirà esattamente cosa controllare.

---

## 6. Struttura del codice

```
supabase/
  01_schema.sql        tabelle, tipi, indici, vincoli
  02_funzioni.sql      trigger, audit, salva/annulla, statistiche
  03_policy.sql        RLS
  04_realtime.sql      pubblicazione Realtime
api/
  utenti.js            funzione Vercel per creare/gestire utenti (service_role)
src/
  data/
    tipi.js            tipi (JSDoc) e costanti: direzioni, causali, categorie, ruoli
    repository.js      UNICO punto di accesso al database (Supabase)
    calcoli.js         punteggio, Pareto, trend: funzioni pure, testate
  ui/                  componenti React per schermata
README.md              guida passo-passo per non sviluppatori
```

L'interfaccia parla solo con `repository.js`: se un domani cambia il backend si
riscrive quel file, non le schermate.

Ordine di sviluppo concordato: schema + login → registrazione movimenti →
registro → statistiche e grafici → audit e impostazioni.

---

## 7. Decisioni da confermare

1. **Annullamento da parte dell'operatore.** La richiesta riserva le
   eliminazioni all'admin. Proposta: l'operatore **non** annulla; se sbaglia
   può correggere (entro la finestra) o chiedere l'annullamento all'admin.
   Alternativa: l'operatore può annullare i propri movimenti entro la stessa
   finestra, sempre con motivo e audit.
2. **Numeri bolla.** Proposta: univoci per direzione e per anno, blocco rigido
   (non solo avviso). Alternativa: univoci in assoluto, oppure solo avviso con
   possibilità di salvare comunque.
3. **Valori storici.** Proposta: peso e costo "fotografati" su ogni riga al
   momento della registrazione. Alternativa: statistiche sempre ai valori
   correnti dell'anagrafica.
4. **"Richieste" nel punteggio.** Proposta: ogni movimento (uscite ed entrate)
   conta come una richiesta. Alternativa: contare solo le uscite.
5. **Finestra di modifica.** Proposta: 7 giorni dalla registrazione (non dalla
   data del movimento).
6. **Repository.** Il progetto va nel repository `magazzino` (attualmente vuoto).
