-- Utenti di prova e funzioni di verifica.
create schema test;
grant usage on schema test to authenticated, anon;

create function test.ok(condizione boolean, messaggio text) returns void
language plpgsql as $$
begin
  if condizione is not true then
    raise exception 'TEST FALLITO: %', messaggio;
  end if;
end $$;

-- Esegue un comando e restituisce il messaggio d'errore (null se è andato bene).
create function test.errore(comando text) returns text
language plpgsql as $$
begin
  execute comando;
  return null;
exception when others then
  return sqlerrm;
end $$;

create function test.come(utente uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(utente::text, ''), false);
end $$;

grant execute on all functions in schema test to authenticated, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@lavanderia.it', '{"nome": "Anna Admin"}'),
  ('00000000-0000-0000-0000-000000000001', 'mario@lavanderia.it', '{"nome": "Mario Rossi"}'),
  ('00000000-0000-0000-0000-000000000002', 'laura@lavanderia.it', '{}'),
  ('00000000-0000-0000-0000-000000000003', 'lettore@lavanderia.it', '{"nome": "Luca Lettura"}');

select test.ok((select count(*) from public.profili) = 4, 'un profilo per ogni utente');
select test.ok((select bool_and(ruolo = 'lettura') from public.profili), 'ruolo iniziale lettura');
select test.ok((select nome from public.profili where email = 'laura@lavanderia.it') = 'laura',
  'nome di ripiego dalla email');

-- Promozione del primo admin dal SQL Editor (nessun utente collegato).
update public.profili set ruolo = 'admin' where email = 'admin@lavanderia.it';
update public.profili set ruolo = 'operatore'
  where email in ('mario@lavanderia.it', 'laura@lavanderia.it');
select test.ok((select ruolo from public.profili where email = 'admin@lavanderia.it') = 'admin',
  'promozione admin da SQL Editor');
