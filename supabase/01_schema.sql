-- =============================================================================
-- Registro Magazzino Biancheria — schema del database
--
-- Da eseguire UNA volta nel SQL Editor di Supabase (vedi README, passo 3).
-- Crea tabelle, vincoli, indici, funzioni, trigger di audit, policy di
-- sicurezza (Row Level Security) e pubblicazione per il tempo reale.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tipi enumerati
-- -----------------------------------------------------------------------------

create type public.ruolo as enum ('admin', 'operatore', 'lettura');
create type public.direzione as enum ('USCITA', 'ENTRATA');
create type public.causale as enum (
  'AUMENTO_DOTAZIONE', 'REINTEGRO_INVENTARIO',
  'RITIRO_DOTAZIONE', 'RITIRO_INVENTARIO',
  'ALTRO'
);
create type public.categoria as enum (
  'federe', 'lenzuola', 'copripiumini', 'sovrapiumini', 'spugna', 'tovagliato', 'altro'
);
create type public.stato_mov as enum ('attivo', 'annullato');

-- -----------------------------------------------------------------------------
-- 2. Tabelle
-- -----------------------------------------------------------------------------

-- Un profilo per ogni utente di Supabase Auth (creato da trigger, § 4).
create table public.profili (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  nome       text not null,
  ruolo      public.ruolo not null default 'lettura',
  attivo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.gruppi (
  id   bigint generated always as identity primary key,
  nome text not null,
  demo boolean not null default false,
  constraint gruppi_nome_non_vuoto check (length(trim(nome)) > 0)
);
create unique index gruppi_nome_univoco on public.gruppi (lower(trim(nome)));

create table public.clienti (
  codice          integer primary key,
  ragione_sociale text not null,
  struttura       text not null,
  gruppo_id       bigint references public.gruppi (id) on delete set null,
  zona            text,
  attivo          boolean not null default true,
  demo            boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint clienti_codice_positivo check (codice > 0)
);
create index clienti_gruppo on public.clienti (gruppo_id);

create table public.articoli (
  codice      text primary key,
  descrizione text not null,
  categoria   public.categoria not null,
  -- Proposto in automatico (codice che finisce per T), modificabile.
  rfid        boolean not null default false,
  -- Codice senza la T finale: serve per "aggrega varianti RFID".
  codice_base text generated always as (
    case when rfid and codice ~ 'T$' then left(codice, -1) else codice end
  ) stored,
  attivo      boolean not null default true,
  demo        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint articoli_codice_valido check (codice = upper(trim(codice)) and length(codice) > 0)
);
create index articoli_codice_base on public.articoli (codice_base);

create table public.movimenti (
  id                  bigint generated always as identity primary key,
  data                date not null default (now() at time zone 'Europe/Rome')::date,
  direzione           public.direzione not null,
  causale             public.causale not null,
  cliente_codice      integer not null,
  richiesto_da        text,
  note                text,
  operatore_id        uuid not null default auth.uid(),
  stato               public.stato_mov not null default 'attivo',
  motivo_annullamento text,
  annullato_da        uuid,
  annullato_il        timestamptz,
  versione            integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  updated_by          uuid,
  demo                boolean not null default false,

  constraint movimenti_cliente_fkey foreign key (cliente_codice)
    references public.clienti (codice) on update cascade on delete restrict,
  constraint movimenti_operatore_fkey foreign key (operatore_id)
    references public.profili (id),
  constraint movimenti_annullato_da_fkey foreign key (annullato_da)
    references public.profili (id),
  constraint movimenti_updated_by_fkey foreign key (updated_by)
    references public.profili (id),

  constraint movimenti_causale_coerente check (
    causale = 'ALTRO'
    or (direzione = 'USCITA'  and causale in ('AUMENTO_DOTAZIONE', 'REINTEGRO_INVENTARIO'))
    or (direzione = 'ENTRATA' and causale in ('RITIRO_DOTAZIONE', 'RITIRO_INVENTARIO'))
  ),
  constraint movimenti_annullamento_motivato check (
    stato = 'attivo'
    or (motivo_annullamento is not null and length(trim(motivo_annullamento)) > 0)
  )
);
create index movimenti_data on public.movimenti (data desc);
create index movimenti_cliente_data on public.movimenti (cliente_codice, data);
create index movimenti_operatore on public.movimenti (operatore_id, created_at);
create index movimenti_causale_data on public.movimenti (causale, data);

create table public.movimento_righe (
  id              bigint generated always as identity primary key,
  movimento_id    bigint not null references public.movimenti (id) on delete cascade,
  articolo_codice text not null references public.articoli (codice)
                    on update cascade on delete restrict,
  quantita        integer not null,
  constraint righe_quantita_positiva check (quantita > 0),
  constraint righe_articolo_unico unique (movimento_id, articolo_codice)
);
create index righe_articolo on public.movimento_righe (articolo_codice);

-- Scritta solo dai trigger (§ 5): nessun utente può inserire, modificare
-- o cancellare righe di audit. Niente FK verso movimenti: l'audit resta.
create table public.audit_movimenti (
  id           bigint generated always as identity primary key,
  movimento_id bigint not null,
  azione       text not null default 'modifica'
                 check (azione in ('creazione', 'modifica', 'annullamento', 'ripristino')),
  utente_id    uuid,
  eseguito_il  timestamptz not null default now(),
  txid         bigint not null default txid_current(),
  prima        jsonb,
  dopo         jsonb,
  constraint audit_una_riga_per_salvataggio unique (movimento_id, txid)
);
create index audit_movimento on public.audit_movimenti (movimento_id, eseguito_il);

create table public.impostazioni (
  id                       integer primary key default 1 check (id = 1),
  finestra_modifica_giorni integer not null default 7 check (finestra_modifica_giorni between 0 and 365),
  peso_reintegri           integer not null default 50 check (peso_reintegri >= 0),
  peso_frequenza           integer not null default 25 check (peso_frequenza >= 0),
  peso_saldo               integer not null default 25 check (peso_saldo >= 0),
  soglia_allerta           integer not null default 60 check (soglia_allerta between 0 and 100),
  giorni_avviso_backup     integer not null default 7 check (giorni_avviso_backup > 0),
  ultimo_backup_il         timestamptz,
  ultimo_backup_da         uuid references public.profili (id),
  constraint impostazioni_pesi_non_nulli check (peso_reintegri + peso_frequenza + peso_saldo > 0)
);
insert into public.impostazioni (id) values (1);

-- -----------------------------------------------------------------------------
-- 3. Funzioni di supporto ai permessi
-- -----------------------------------------------------------------------------

-- Ruolo dell'utente collegato; null se non collegato, senza profilo o disattivato.
create function public.ruolo_corrente()
returns public.ruolo
language sql stable security definer set search_path = ''
as $$
  select p.ruolo from public.profili p where p.id = auth.uid() and p.attivo
$$;

create function public.finestra_modifica()
returns interval
language sql stable security definer set search_path = ''
as $$
  select make_interval(days => i.finestra_modifica_giorni) from public.impostazioni i where i.id = 1
$$;

-- La regola "chi può modificare questo movimento" in un solo punto.
-- Admin: qualunque movimento attivo. Operatore: i propri, attivi, registrati
-- entro la finestra (contata dalla registrazione, non dalla data del movimento).
create function public.puo_modificare_movimento(p_movimento_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case public.ruolo_corrente()
      when 'admin' then m.stato = 'attivo'
      when 'operatore' then m.stato = 'attivo'
        and m.operatore_id = auth.uid()
        and m.created_at >= now() - public.finestra_modifica()
      else false
    end
    from public.movimenti m where m.id = p_movimento_id
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 4. Trigger sulle anagrafiche e sui profili
-- -----------------------------------------------------------------------------

-- Nuovo utente in Supabase Auth → profilo con ruolo "lettura".
create function public._crea_profilo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profili (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1), 'Utente')
  );
  return new;
end
$$;

create trigger crea_profilo
  after insert on auth.users
  for each row execute function public._crea_profilo();

-- Solo l'admin cambia ruolo e stato; resta sempre almeno un admin attivo.
create function public._profili_proteggi()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  if auth.uid() is not null and public.ruolo_corrente() is distinct from 'admin' then
    new.ruolo := old.ruolo;
    new.attivo := old.attivo;
    new.email := old.email;
  end if;
  if old.ruolo = 'admin' and old.attivo
     and (new.ruolo <> 'admin' or not new.attivo)
     and not exists (
       select 1 from public.profili p
       where p.id <> old.id and p.ruolo = 'admin' and p.attivo
     ) then
    raise exception 'ULTIMO_ADMIN'
      using detail = 'Deve restare almeno un amministratore attivo.';
  end if;
  return new;
end
$$;

create trigger profili_proteggi
  before update on public.profili
  for each row execute function public._profili_proteggi();

create function public._aggiorna_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger clienti_updated_at before update on public.clienti
  for each row execute function public._aggiorna_updated_at();
create trigger articoli_updated_at before update on public.articoli
  for each row execute function public._aggiorna_updated_at();

-- Codice articolo in maiuscolo; flag RFID proposto dalla T finale all'inserimento.
create function public._articoli_normalizza()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.codice := upper(trim(new.codice));
  if tg_op = 'INSERT' and new.rfid is not true and new.codice ~ 'T$' then
    new.rfid := true;
  end if;
  return new;
end
$$;

create trigger articoli_normalizza before insert or update on public.articoli
  for each row execute function public._articoli_normalizza();

-- -----------------------------------------------------------------------------
-- 5. Trigger sui movimenti: campi protetti e audit
-- -----------------------------------------------------------------------------

-- RLS decide SE si può modificare una riga; questo trigger decide QUALI campi.
create function public._movimenti_proteggi()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_demo boolean := coalesce(current_setting('app.dati_demo', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.operatore_id := v_uid;
    end if;
    if not v_demo then
      new.created_at := now();
      new.demo := false;
    end if;
    new.stato := 'attivo';
    new.motivo_annullamento := null;
    new.annullato_da := null;
    new.annullato_il := null;
    new.versione := 1;
    new.updated_at := null;
    new.updated_by := null;
    return new;
  end if;

  -- UPDATE
  -- Cambio del codice cliente in anagrafica (ON UPDATE CASCADE): passa sempre,
  -- anche sui movimenti annullati, senza toccare versione e autore.
  if pg_trigger_depth() > 1
     and (to_jsonb(new) - 'cliente_codice') = (to_jsonb(old) - 'cliente_codice') then
    return new;
  end if;

  new.id := old.id;
  new.operatore_id := old.operatore_id;
  new.created_at := old.created_at;
  new.demo := old.demo;

  if new.stato is distinct from old.stato then
    if v_uid is not null and public.ruolo_corrente() is distinct from 'admin' then
      raise exception 'PERMESSO_NEGATO'
        using detail = 'Solo un amministratore può annullare o ripristinare un movimento.';
    end if;
    if new.stato = 'annullato' then
      new.annullato_da := v_uid;
      new.annullato_il := now();
    else
      new.motivo_annullamento := null;
      new.annullato_da := null;
      new.annullato_il := null;
    end if;
  elsif old.stato = 'annullato' then
    raise exception 'MOVIMENTO_ANNULLATO'
      using detail = 'Un movimento annullato non si può modificare: va prima ripristinato.';
  else
    new.motivo_annullamento := old.motivo_annullamento;
    new.annullato_da := old.annullato_da;
    new.annullato_il := old.annullato_il;
  end if;

  new.versione := old.versione + 1;
  new.updated_at := now();
  new.updated_by := v_uid;
  return new;
end
$$;

create trigger movimenti_proteggi
  before insert or update on public.movimenti
  for each row execute function public._movimenti_proteggi();

-- Fotografia completa di un movimento (testata + righe) per l'audit.
-- Esclusi i campi che cambiano a ogni salvataggio: chi e quando stanno
-- già nella riga di audit.
create function public._fotografia_movimento(p_id bigint)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select to_jsonb(m) - array['versione', 'updated_at', 'updated_by', 'created_at', 'demo']
    || jsonb_build_object('righe', coalesce((
      select jsonb_agg(jsonb_build_object('articolo_codice', r.articolo_codice, 'quantita', r.quantita)
                       order by r.articolo_codice)
      from public.movimento_righe r where r.movimento_id = m.id
    ), '[]'::jsonb))
  from public.movimenti m where m.id = p_id
$$;

-- Prima modifica di un movimento nella transazione: crea la riga di audit
-- con la fotografia "prima" (il database è ancora intatto in quel momento).
create function public._audit_prima()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if coalesce(current_setting('app.senza_audit', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'movimenti' then
    v_id := coalesce(new.id, old.id);
  else
    v_id := coalesce(new.movimento_id, old.movimento_id);
  end if;
  insert into public.audit_movimenti (movimento_id, utente_id, prima)
  values (
    v_id,
    auth.uid(),
    case when tg_table_name = 'movimenti' and tg_op = 'INSERT' then null
         else public._fotografia_movimento(v_id) end
  )
  on conflict (movimento_id, txid) do nothing;
  return coalesce(new, old);
end
$$;

-- A fine transazione: fotografia "dopo" e tipo di azione. Se nulla è
-- cambiato davvero, la riga di audit viene tolta.
create function public._audit_dopo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
  v_audit public.audit_movimenti;
  v_dopo jsonb;
begin
  if coalesce(current_setting('app.senza_audit', true), '') = 'on' then
    return null;
  end if;
  if tg_table_name = 'movimenti' then
    v_id := coalesce(new.id, old.id);
  else
    v_id := coalesce(new.movimento_id, old.movimento_id);
  end if;

  select * into v_audit from public.audit_movimenti
  where movimento_id = v_id and txid = txid_current();
  if not found then
    return null;
  end if;

  v_dopo := public._fotografia_movimento(v_id);
  if v_dopo is not distinct from v_audit.prima then
    delete from public.audit_movimenti where id = v_audit.id;
    return null;
  end if;

  update public.audit_movimenti set
    dopo = v_dopo,
    azione = case
      when v_audit.prima is null then 'creazione'
      when v_audit.prima ->> 'stato' = 'attivo' and v_dopo ->> 'stato' = 'annullato' then 'annullamento'
      when v_audit.prima ->> 'stato' = 'annullato' and v_dopo ->> 'stato' = 'attivo' then 'ripristino'
      else 'modifica'
    end
  where id = v_audit.id;
  return null;
end
$$;

create trigger movimenti_audit_prima
  before insert or update on public.movimenti
  for each row execute function public._audit_prima();
create trigger righe_audit_prima
  before insert or update or delete on public.movimento_righe
  for each row execute function public._audit_prima();

create constraint trigger movimenti_audit_dopo
  after insert or update on public.movimenti
  deferrable initially deferred
  for each row execute function public._audit_dopo();
create constraint trigger righe_audit_dopo
  after insert or update or delete on public.movimento_righe
  deferrable initially deferred
  for each row execute function public._audit_dopo();

-- -----------------------------------------------------------------------------
-- 6. Funzioni chiamate dall'app
-- -----------------------------------------------------------------------------

-- Crea (p_id null) o modifica un movimento con le sue righe, in un colpo solo.
-- In modifica controlla che nessun altro l'abbia cambiato nel frattempo
-- (p_versione = versione letta dall'app). Gira con i permessi dell'utente:
-- le policy RLS valgono anche qui.
--
-- p_testata: {"data","direzione","causale","cliente_codice","richiesto_da","note"}
-- p_righe:   [{"articolo_codice": "FED5080T", "quantita": 20}, ...]
create function public.salva_movimento(
  p_id bigint,
  p_versione integer,
  p_testata jsonb,
  p_righe jsonb
)
returns public.movimenti
language plpgsql security invoker set search_path = ''
as $$
declare
  v_mov public.movimenti;
  v_righe jsonb;
  v_versione_attuale integer;
begin
  -- Righe: almeno una, quantità intere positive, stesso articolo sommato.
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'RIGHE_MANCANTI' using detail = 'Aggiungi almeno un articolo.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_righe) e
    where coalesce(trim(e ->> 'articolo_codice'), '') = ''
       or (e ->> 'quantita') is null
       or (e ->> 'quantita') !~ '^\s*\d+\s*$'
       or (e ->> 'quantita')::numeric <= 0
  ) then
    raise exception 'QUANTITA_NON_VALIDA'
      using detail = 'Ogni riga deve avere un articolo e una quantità intera maggiore di zero.';
  end if;
  -- Le righe restano nell'ordine in cui sono state inserite.
  select jsonb_agg(jsonb_build_object('articolo_codice', codice, 'quantita', totale) order by posizione)
  into v_righe
  from (
    select upper(trim(e ->> 'articolo_codice')) as codice,
           sum((e ->> 'quantita')::integer) as totale,
           min(n) as posizione
    from jsonb_array_elements(p_righe) with ordinality as x (e, n)
    group by 1
  ) t;

  if p_id is null then
    insert into public.movimenti (data, direzione, causale, cliente_codice, richiesto_da, note)
    values (
      coalesce((p_testata ->> 'data')::date, (now() at time zone 'Europe/Rome')::date),
      (p_testata ->> 'direzione')::public.direzione,
      (p_testata ->> 'causale')::public.causale,
      (p_testata ->> 'cliente_codice')::integer,
      nullif(trim(p_testata ->> 'richiesto_da'), ''),
      nullif(trim(p_testata ->> 'note'), '')
    )
    returning * into v_mov;
  else
    select m.versione into v_versione_attuale from public.movimenti m where m.id = p_id;
    if not found then
      raise exception 'MOVIMENTO_NON_TROVATO' using detail = 'Il movimento non esiste o non è visibile.';
    end if;
    if v_versione_attuale <> p_versione then
      raise exception 'MOVIMENTO_CAMBIATO'
        using detail = 'Il movimento è stato modificato da un altro utente mentre lo stavi modificando.';
    end if;
    if not public.puo_modificare_movimento(p_id) then
      raise exception 'PERMESSO_NEGATO'
        using detail = 'Non puoi modificare questo movimento (non è tuo, è annullato o è fuori dalla finestra di modifica).';
    end if;

    update public.movimenti set
      data = coalesce((p_testata ->> 'data')::date, data),
      direzione = (p_testata ->> 'direzione')::public.direzione,
      causale = (p_testata ->> 'causale')::public.causale,
      cliente_codice = (p_testata ->> 'cliente_codice')::integer,
      richiesto_da = nullif(trim(p_testata ->> 'richiesto_da'), ''),
      note = nullif(trim(p_testata ->> 'note'), '')
    where id = p_id and versione = p_versione
    returning * into v_mov;
    if not found then
      raise exception 'MOVIMENTO_CAMBIATO'
        using detail = 'Il movimento è stato modificato da un altro utente mentre lo stavi modificando.';
    end if;

    delete from public.movimento_righe r
    where r.movimento_id = p_id
      and r.articolo_codice not in (select e ->> 'articolo_codice' from jsonb_array_elements(v_righe) e);
  end if;

  insert into public.movimento_righe (movimento_id, articolo_codice, quantita)
  select v_mov.id, e ->> 'articolo_codice', (e ->> 'quantita')::integer
  from jsonb_array_elements(v_righe) with ordinality as x (e, n)
  order by n
  on conflict (movimento_id, articolo_codice) do update
    set quantita = excluded.quantita
    where public.movimento_righe.quantita <> excluded.quantita;

  return v_mov;
end
$$;

-- Annullamento logico (solo admin), con motivo obbligatorio.
create function public.annulla_movimento(p_id bigint, p_versione integer, p_motivo text)
returns public.movimenti
language plpgsql security invoker set search_path = ''
as $$
declare
  v_mov public.movimenti;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'MOTIVO_MANCANTE' using detail = 'Indica il motivo dell''annullamento.';
  end if;
  if public.ruolo_corrente() is distinct from 'admin' then
    raise exception 'PERMESSO_NEGATO' using detail = 'Solo un amministratore può annullare un movimento.';
  end if;
  update public.movimenti
     set stato = 'annullato', motivo_annullamento = trim(p_motivo)
   where id = p_id and versione = p_versione and stato = 'attivo'
  returning * into v_mov;
  if not found then
    raise exception 'MOVIMENTO_CAMBIATO'
      using detail = 'Il movimento è stato modificato o annullato da un altro utente: ricarica e riprova.';
  end if;
  return v_mov;
end
$$;

create function public.ripristina_movimento(p_id bigint, p_versione integer)
returns public.movimenti
language plpgsql security invoker set search_path = ''
as $$
declare
  v_mov public.movimenti;
begin
  if public.ruolo_corrente() is distinct from 'admin' then
    raise exception 'PERMESSO_NEGATO' using detail = 'Solo un amministratore può ripristinare un movimento.';
  end if;
  update public.movimenti
     set stato = 'attivo'
   where id = p_id and versione = p_versione and stato = 'annullato'
  returning * into v_mov;
  if not found then
    raise exception 'MOVIMENTO_CAMBIATO'
      using detail = 'Il movimento è stato modificato da un altro utente: ricarica e riprova.';
  end if;
  return v_mov;
end
$$;

-- -----------------------------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profili          enable row level security;
alter table public.gruppi           enable row level security;
alter table public.clienti          enable row level security;
alter table public.articoli         enable row level security;
alter table public.movimenti        enable row level security;
alter table public.movimento_righe  enable row level security;
alter table public.audit_movimenti  enable row level security;
alter table public.impostazioni     enable row level security;

-- Profili: tutti gli utenti attivi leggono i nomi (servono per "operatore");
-- ognuno può cambiare il proprio nome; ruolo e stato solo l'admin (trigger).
create policy profili_lettura on public.profili for select to authenticated
  using (public.ruolo_corrente() is not null or id = auth.uid());
create policy profili_modifica on public.profili for update to authenticated
  using (public.ruolo_corrente() = 'admin' or (id = auth.uid() and public.ruolo_corrente() is not null))
  with check (public.ruolo_corrente() = 'admin' or id = auth.uid());

-- Anagrafiche: lettura per tutti gli utenti attivi, scrittura solo admin.
create policy gruppi_lettura on public.gruppi for select to authenticated
  using (public.ruolo_corrente() is not null);
create policy gruppi_scrittura on public.gruppi for all to authenticated
  using (public.ruolo_corrente() = 'admin') with check (public.ruolo_corrente() = 'admin');

create policy clienti_lettura on public.clienti for select to authenticated
  using (public.ruolo_corrente() is not null);
create policy clienti_scrittura on public.clienti for all to authenticated
  using (public.ruolo_corrente() = 'admin') with check (public.ruolo_corrente() = 'admin');

create policy articoli_lettura on public.articoli for select to authenticated
  using (public.ruolo_corrente() is not null);
create policy articoli_scrittura on public.articoli for all to authenticated
  using (public.ruolo_corrente() = 'admin') with check (public.ruolo_corrente() = 'admin');

-- Movimenti: gli annullati li vede solo l'admin. Nessuna cancellazione fisica.
create policy movimenti_lettura on public.movimenti for select to authenticated
  using (
    public.ruolo_corrente() = 'admin'
    or (public.ruolo_corrente() is not null and stato = 'attivo')
  );
create policy movimenti_inserimento on public.movimenti for insert to authenticated
  with check (
    public.ruolo_corrente() in ('admin', 'operatore')
    and operatore_id = auth.uid()
    and stato = 'attivo'
  );
create policy movimenti_modifica on public.movimenti for update to authenticated
  using (
    public.ruolo_corrente() = 'admin'
    or (
      public.ruolo_corrente() = 'operatore'
      and operatore_id = auth.uid()
      and stato = 'attivo'
      and created_at >= now() - public.finestra_modifica()
    )
  )
  with check (
    public.ruolo_corrente() = 'admin'
    or (public.ruolo_corrente() = 'operatore' and operatore_id = auth.uid() and stato = 'attivo')
  );

-- Righe: visibili se la testata è visibile; modificabili se la testata lo è.
create policy righe_lettura on public.movimento_righe for select to authenticated
  using (exists (select 1 from public.movimenti m where m.id = movimento_id));
create policy righe_inserimento on public.movimento_righe for insert to authenticated
  with check (public.puo_modificare_movimento(movimento_id));
create policy righe_modifica on public.movimento_righe for update to authenticated
  using (public.puo_modificare_movimento(movimento_id))
  with check (public.puo_modificare_movimento(movimento_id));
create policy righe_cancellazione on public.movimento_righe for delete to authenticated
  using (public.puo_modificare_movimento(movimento_id));

-- Audit: in sola lettura, per i movimenti che l'utente può vedere.
create policy audit_lettura on public.audit_movimenti for select to authenticated
  using (
    public.ruolo_corrente() = 'admin'
    or exists (select 1 from public.movimenti m where m.id = movimento_id)
  );

create policy impostazioni_lettura on public.impostazioni for select to authenticated
  using (public.ruolo_corrente() is not null);
create policy impostazioni_modifica on public.impostazioni for update to authenticated
  using (public.ruolo_corrente() = 'admin') with check (public.ruolo_corrente() = 'admin');

-- Privilegi espliciti: gli anonimi (non collegati) non toccano nulla;
-- gli utenti collegati passano comunque dalle policy qui sopra.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke insert, update, delete on public.audit_movimenti from authenticated;
revoke insert, delete on public.profili, public.impostazioni from authenticated;


-- -----------------------------------------------------------------------------
-- 8. Tempo reale
-- -----------------------------------------------------------------------------
-- Ogni salvataggio aggiorna la testata (versione), quindi basta ascoltare
-- "movimenti": l'app ricarica il movimento cambiato con le sue righe.

alter publication supabase_realtime add table public.movimenti;

-- -----------------------------------------------------------------------------
-- 9. Dati demo
-- -----------------------------------------------------------------------------
-- 15 clienti, 30 articoli, 3 mesi di movimenti. Tutto marcato demo = true e
-- cancellabile con cancella_dati_demo(). Si possono lanciare dall'app (admin)
-- oppure dal SQL Editor:  select public.genera_dati_demo();

create function public.genera_dati_demo()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_operatore uuid := auth.uid();
  v_giorno date;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_cli record;
  v_prob numeric;
  v_dir public.direzione;
  v_causale public.causale;
  v_r numeric;
  v_mov_id bigint;
  v_n_righe integer;
  v_qta integer;
  v_movimenti integer := 0;
  v_referenti text[] := array['Governante', 'Reception', 'Direttore', 'Maître', 'Economato', null, null];
begin
  if v_operatore is not null and public.ruolo_corrente() is distinct from 'admin' then
    raise exception 'PERMESSO_NEGATO' using detail = 'Solo un amministratore può generare i dati demo.';
  end if;
  if v_operatore is null then
    select p.id into v_operatore from public.profili p
    where p.ruolo = 'admin' and p.attivo order by p.created_at limit 1;
    if v_operatore is null then
      raise exception 'NESSUN_ADMIN' using detail = 'Crea prima un utente amministratore (README, passo 5).';
    end if;
  end if;
  if exists (select 1 from public.movimenti where not demo) then
    raise exception 'DATI_REALI_PRESENTI'
      using detail = 'Ci sono già movimenti reali: i dati demo non vengono generati per non mescolarli.';
  end if;
  if exists (select 1 from public.clienti where demo) then
    raise exception 'DEMO_GIA_PRESENTI' using detail = 'I dati demo sono già presenti.';
  end if;

  perform set_config('app.dati_demo', 'on', true);
  perform set_config('app.senza_audit', 'on', true);
  perform setseed(0.42);

  insert into public.gruppi (nome, demo) values
    ('Catena Tirreno (demo)', true), ('Gruppo Colline (demo)', true), ('Apuane Hospitality (demo)', true);

  create temp table _demo_clienti on commit drop as
  select * from (values
    (990001, 'Riviera Hotels S.p.A.',        'Grand Hotel Riviera',         'Catena Tirreno (demo)',     'Versilia',     'hotel',        5, 0.90),
    (990002, 'Riviera Hotels S.p.A.',        'Hotel Riviera Lido',          'Catena Tirreno (demo)',     'Versilia',     'hotel',        3, 0.30),
    (990003, 'Riviera Hotels S.p.A.',        'Riviera Palace Firenze',      'Catena Tirreno (demo)',     'Firenze',      'hotel',        4, 0.50),
    (990004, 'Colline Toscane S.r.l.',       'Relais Le Colline',           'Gruppo Colline (demo)',     'Chianti',      'hotel',        2, 0.20),
    (990005, 'Colline Toscane S.r.l.',       'Castello delle Colline',      'Gruppo Colline (demo)',     'Val d''Orcia', 'hotel',        3, 0.80),
    (990006, 'Villa Apuana S.r.l.',          'Villa Apuana Resort',         'Apuane Hospitality (demo)', 'Versilia',     'hotel',        4, 0.40),
    (990007, 'Apuane Hospitality S.r.l.',    'Hotel Marmo',                 'Apuane Hospitality (demo)', 'Versilia',     'hotel',        2, 0.10),
    (990008, 'Palazzo Arno S.r.l.',          'Palazzo sull''Arno',          null,                        'Firenze',      'hotel',        4, 0.60),
    (990009, 'Tenuta Il Poggio Soc. Agr.',   'Tenuta Il Poggio',            null,                        'Chianti',      'hotel',        2, 0.30),
    (990010, 'La Darsena S.r.l.',            'Ristorante La Darsena',       null,                        'Versilia',     'ristorante',   2, 0.70),
    (990011, 'Osteria del Ponte S.n.c.',     'Osteria del Ponte',           null,                        'Firenze',      'ristorante',   1, 0.20),
    (990012, 'Bagno Aurora S.r.l.',          'Bagno Aurora',                null,                        'Versilia',     'stabilimento', 2, 0.40),
    (990013, 'Hotel Belvedere S.r.l.',       'Hotel Belvedere',             null,                        'Lucca',        'hotel',        2, 0.20),
    (990014, 'Grand Hotel Versilia S.p.A.',  'Grand Hotel Versilia',        null,                        'Versilia',     'hotel',        5, 0.50),
    (990015, 'Locanda dei Fiori S.r.l.',     'Locanda dei Fiori',           null,                        'Lucca',        'ristorante',   1, 0.10)
  ) as t (codice, ragione_sociale, struttura, gruppo, zona, tipo, taglia, problema);

  insert into public.clienti (codice, ragione_sociale, struttura, gruppo_id, zona, demo)
  select d.codice, d.ragione_sociale, d.struttura, g.id, d.zona, true
  from _demo_clienti d left join public.gruppi g on g.nome = d.gruppo;

  create temp table _demo_articoli on commit drop as
  select * from (values
    ('DEMO-FED5080',   'Federa 50x80 percalle',                  'federe',       'hotel',        30),
    ('DEMO-FED5080T',  'Federa 50x80 percalle RFID',             'federe',       'hotel',        30),
    ('DEMO-FED5090',   'Federa 50x90 Oxford',                    'federe',       'hotel',        20),
    ('DEMO-FED5090T',  'Federa 50x90 Oxford RFID',               'federe',       'hotel',        20),
    ('DEMO-LEN160',    'Lenzuolo singolo 160x290',               'lenzuola',     'hotel',        25),
    ('DEMO-LEN160T',   'Lenzuolo singolo 160x290 RFID',          'lenzuola',     'hotel',        25),
    ('DEMO-LEN240',    'Lenzuolo matrimoniale 240x300',          'lenzuola',     'hotel',        30),
    ('DEMO-LEN240T',   'Lenzuolo matrimoniale 240x300 RFID',     'lenzuola',     'hotel',        30),
    ('DEMO-LEN270T',   'Lenzuolo king 270x310 RFID',             'lenzuola',     'hotel',        12),
    ('DEMO-CPP155',    'Copripiumino singolo 155x220',           'copripiumini', 'hotel',        10),
    ('DEMO-CPP155T',   'Copripiumino singolo 155x220 RFID',      'copripiumini', 'hotel',        10),
    ('DEMO-CPP255',    'Copripiumino matrimoniale 255x220',      'copripiumini', 'hotel',        15),
    ('DEMO-CPP255T',   'Copripiumino matrimoniale 255x220 RFID', 'copripiumini', 'hotel',        15),
    ('DEMO-SOV150',    'Sovrapiumino singolo',                   'sovrapiumini', 'hotel',         6),
    ('DEMO-SOV250',    'Sovrapiumino matrimoniale',              'sovrapiumini', 'hotel',         8),
    ('DEMO-SOV250T',   'Sovrapiumino matrimoniale RFID',         'sovrapiumini', 'hotel',         8),
    ('DEMO-TELO100',   'Telo bagno 100x150',                     'spugna',       'hotel',        30),
    ('DEMO-TELO100T',  'Telo bagno 100x150 RFID',                'spugna',       'hotel',        30),
    ('DEMO-ASC60',     'Asciugamano viso 60x100',                'spugna',       'hotel',        30),
    ('DEMO-ASC60T',    'Asciugamano viso 60x100 RFID',           'spugna',       'hotel',        30),
    ('DEMO-OSP40',     'Ospite 40x60',                           'spugna',       'hotel',        25),
    ('DEMO-OSP40T',    'Ospite 40x60 RFID',                      'spugna',       'hotel',        25),
    ('DEMO-TAP50',     'Tappeto bagno 50x80',                    'spugna',       'hotel',        15),
    ('DEMO-ACCT',      'Accappatoio spugna RFID',                'spugna',       'stabilimento', 10),
    ('DEMO-TELP90',    'Telo piscina 90x180',                    'spugna',       'stabilimento', 40),
    ('DEMO-TOV180',    'Tovaglia 180x180',                       'tovagliato',   'ristorante',   15),
    ('DEMO-TOV140',    'Tovaglia 140x140',                       'tovagliato',   'ristorante',   15),
    ('DEMO-TOV250',    'Tovaglia rettangolare 180x250',          'tovagliato',   'ristorante',   10),
    ('DEMO-TOVG45',    'Tovagliolo 45x45',                       'tovagliato',   'ristorante',   60),
    ('DEMO-COP100',    'Coprimacchia 100x100',                   'tovagliato',   'ristorante',   20)
  ) as t (codice, descrizione, categoria, tipo, quantita_tipica);

  insert into public.articoli (codice, descrizione, categoria, demo)
  select a.codice, a.descrizione, a.categoria::public.categoria, true from _demo_articoli a;

  -- Gli hotel grandi usano i capi RFID, gli altri quelli senza tag.
  -- Gli stabilimenti usano anche la spugna da hotel.
  create temp table _demo_assortimento on commit drop as
  select c.codice as cliente, a.codice as articolo, a.quantita_tipica
  from _demo_clienti c
  join _demo_articoli a
    on (a.tipo = c.tipo or (c.tipo = 'stabilimento' and a.codice in ('DEMO-TELO100', 'DEMO-ASC60')))
  join public.articoli art on art.codice = a.codice
  where not exists (
    select 1 from public.articoli gemello
    where gemello.codice_base = art.codice_base and gemello.codice <> art.codice
  )
  or art.rfid = (c.taglia >= 4);

  v_giorno := v_oggi - 91;
  while v_giorno <= v_oggi loop
    if extract(isodow from v_giorno) <> 7 then
      for v_cli in select * from _demo_clienti loop
        v_prob := case v_cli.tipo when 'hotel' then 0.10 + 0.05 * v_cli.taglia + 0.20 * v_cli.problema
                              else 0.15 + 0.20 * v_cli.problema end;
        continue when random() > v_prob;

        v_dir := case when random() < 0.55 + 0.25 * v_cli.problema then 'USCITA' else 'ENTRATA' end;
        v_r := random();
        if v_dir = 'USCITA' then
          v_causale := case when v_r < 0.05 then 'ALTRO'
                            when v_r < 0.45 + 0.45 * v_cli.problema then 'REINTEGRO_INVENTARIO'
                            else 'AUMENTO_DOTAZIONE' end;
        else
          v_causale := case when v_r < 0.05 then 'ALTRO'
                            when v_r < 0.65 then 'RITIRO_INVENTARIO'
                            else 'RITIRO_DOTAZIONE' end;
        end if;

        insert into public.movimenti
          (data, direzione, causale, cliente_codice, richiesto_da, note, operatore_id, created_at, demo)
        values (
          v_giorno, v_dir, v_causale, v_cli.codice,
          v_referenti[1 + floor(random() * array_length(v_referenti, 1))::integer],
          case when random() < 0.08 then 'Richiesta urgente' end,
          v_operatore,
          (v_giorno + time '07:30' + random() * interval '9 hours') at time zone 'Europe/Rome',
          true
        )
        returning id into v_mov_id;
        v_movimenti := v_movimenti + 1;

        v_n_righe := 1 + floor(random() * 4)::integer;
        insert into public.movimento_righe (movimento_id, articolo_codice, quantita)
        select v_mov_id, s.articolo,
          greatest(1, round(
            s.quantita_tipica * (0.4 + random()) * (0.5 + v_cli.taglia / 3.0)
            * case when v_causale = 'REINTEGRO_INVENTARIO' then 0.4 + v_cli.problema
                   when v_causale = 'AUMENTO_DOTAZIONE' then 1.5
                   when v_causale = 'RITIRO_DOTAZIONE' then 1.0
                   else 0.5 end
          )::integer)
        from (
          select * from _demo_assortimento where cliente = v_cli.codice order by random() limit v_n_righe
        ) s;
      end loop;
    end if;
    v_giorno := v_giorno + 1;
  end loop;

  return format('Creati 15 clienti, 30 articoli e %s movimenti demo.', v_movimenti);
end
$$;

create function public.cancella_dati_demo()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_movimenti integer;
begin
  if auth.uid() is not null and public.ruolo_corrente() is distinct from 'admin' then
    raise exception 'PERMESSO_NEGATO' using detail = 'Solo un amministratore può cancellare i dati demo.';
  end if;
  perform set_config('app.senza_audit', 'on', true);
  delete from public.audit_movimenti a
  using public.movimenti m where m.id = a.movimento_id and m.demo;
  delete from public.movimenti where demo;
  get diagnostics v_movimenti = row_count;
  begin
    delete from public.clienti where demo;
    delete from public.articoli where demo;
    delete from public.gruppi where demo;
  exception when foreign_key_violation then
    raise exception 'DEMO_IN_USO'
      using detail = 'Alcuni clienti o articoli demo sono usati in movimenti reali: correggi quei movimenti e riprova.';
  end;
  return format('Cancellati %s movimenti demo e le relative anagrafiche.', v_movimenti);
end
$$;

-- -----------------------------------------------------------------------------
-- 10. Funzioni eseguibili dall'app
-- -----------------------------------------------------------------------------
-- Tutte le altre (interne, trigger) non sono richiamabili dall'esterno.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.ruolo_corrente(),
  public.finestra_modifica(),
  public.puo_modificare_movimento(bigint),
  public.salva_movimento(bigint, integer, jsonb, jsonb),
  public.annulla_movimento(bigint, integer, text),
  public.ripristina_movimento(bigint, integer),
  public.genera_dati_demo(),
  public.cancella_dati_demo()
to authenticated;

commit;
