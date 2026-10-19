-- Permessi per ruolo, modifiche simultanee, annullamento e audit.
-- Utenti: admin ...0a, Mario (operatore) ...01, Laura (operatore) ...02,
-- Luca (lettura) ...03.

-- Anagrafiche di prova (dal SQL Editor, come farebbe l'admin all'avvio).
insert into public.gruppi (nome) values ('Gruppo Prova');
insert into public.clienti (codice, ragione_sociale, struttura, gruppo_id, zona) values
  (1001, 'Alberghi Prova S.p.A.', 'Hotel Uno', (select id from public.gruppi), 'Versilia'),
  (1002, 'Alberghi Prova S.p.A.', 'Hotel Due', (select id from public.gruppi), 'Firenze');
insert into public.articoli (codice, descrizione, categoria) values
  ('fed5080t', 'Federa 50x80 RFID', 'federe'),
  ('FED5080', 'Federa 50x80', 'federe'),
  ('TELO100', 'Telo bagno', 'spugna');

select test.ok((select rfid and codice_base = 'FED5080' from public.articoli where codice = 'FED5080T'),
  'codice in maiuscolo, T finale = RFID, codice base senza T');
select test.ok((select not rfid and codice_base = 'FED5080' from public.articoli where codice = 'FED5080'),
  'articolo senza T: stesso codice base, non RFID');
select test.ok(test.errore($$insert into public.gruppi (nome) values ('gruppo prova ')$$) is not null,
  'gruppi unici senza badare a maiuscole e spazi');

set role authenticated;

-- ---------------------------------------------------------------- anonimo
select test.come(null);
reset role;
set role anon;
select test.ok(test.errore('select * from public.clienti') like 'permission denied%',
  'anonimo: nessun accesso alle tabelle');
select test.ok(test.errore($$select public.salva_movimento(null, null, '{}', '[]')$$) like 'permission denied%',
  'anonimo: nessuna funzione');
reset role;
set role authenticated;

-- ---------------------------------------------------------------- lettura
select test.come('00000000-0000-0000-0000-000000000003');
select test.ok((select count(*) from public.clienti) = 2, 'lettura: vede i clienti');
select test.ok(test.errore($$
  select public.salva_movimento(null, null,
    '{"direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
    '[{"articolo_codice":"FED5080T","quantita":10}]')
$$) like '%row-level security%', 'lettura: non registra movimenti');
select test.ok(test.errore($$insert into public.clienti (codice, ragione_sociale, struttura) values (5, 'x', 'y')$$)
  like '%row-level security%', 'lettura: non tocca le anagrafiche');

-- ---------------------------------------------------------------- operatore: creazione
select test.come('00000000-0000-0000-0000-000000000001');
select test.ok(test.errore($$insert into public.clienti (codice, ragione_sociale, struttura) values (5, 'x', 'y')$$)
  like '%row-level security%', 'operatore: non tocca le anagrafiche');
select test.ok(test.errore($$update public.impostazioni set soglia_allerta = 10$$) is null
  and (select soglia_allerta from public.impostazioni) = 60, 'operatore: non cambia le impostazioni');

select public.salva_movimento(null, null,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001,
    "richiesto_da":"Governante","note":"  "}',
  '[{"articolo_codice":"fed5080t","quantita":10},{"articolo_codice":"FED5080T","quantita":5},
    {"articolo_codice":"TELO100","quantita":"8"}]');

create temp table m1 as select max(id) as id from public.movimenti;
grant select on m1 to authenticated;

select test.ok((select operatore_id = '00000000-0000-0000-0000-000000000001' and versione = 1
                  and note is null and data = '2026-10-15'
                from public.movimenti where id = (select id from m1)),
  'creazione: operatore automatico, versione 1, note vuote = null');
select test.ok((select quantita from public.movimento_righe
                where movimento_id = (select id from m1) and articolo_codice = 'FED5080T') = 15,
  'stesso articolo due volte: quantità sommate');
select test.ok((select azione = 'creazione' and prima is null and jsonb_array_length(dopo -> 'righe') = 2
                  and utente_id = '00000000-0000-0000-0000-000000000001'
                from public.audit_movimenti where movimento_id = (select id from m1)),
  'audit: una riga "creazione" con le righe');

-- Il campo operatore non si può falsificare.
insert into public.movimenti (direzione, causale, cliente_codice, operatore_id)
  values ('ENTRATA', 'RITIRO_INVENTARIO', 1002, '00000000-0000-0000-0000-000000000002');
select test.ok((select operatore_id from public.movimenti order by id desc limit 1)
  = '00000000-0000-0000-0000-000000000001', 'operatore imposto dal database');

-- Validazioni.
select test.ok(test.errore($$select public.salva_movimento(null, null,
  '{"direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":0}]')$$) like 'QUANTITA_NON_VALIDA%', 'quantità zero');
select test.ok(test.errore($$select public.salva_movimento(null, null,
  '{"direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":-3}]')$$) like 'QUANTITA_NON_VALIDA%', 'quantità negativa');
select test.ok(test.errore($$select public.salva_movimento(null, null,
  '{"direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":2.5}]')$$) like 'QUANTITA_NON_VALIDA%', 'quantità decimale');
select test.ok(test.errore($$select public.salva_movimento(null, null,
  '{"direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[]')$$) like 'RIGHE_MANCANTI%', 'nessuna riga');
select test.ok(test.errore($$select public.salva_movimento(null, null,
  '{"direzione":"USCITA","causale":"RITIRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":1}]')$$) like '%movimenti_causale_coerente%', 'causale incoerente');
select test.ok(test.errore($$select public.salva_movimento(null, null,
  '{"direzione":"USCITA","causale":"REINTEGRO_INVENTARIO"}',
  '[{"articolo_codice":"FED5080T","quantita":1}]')$$) like '%cliente_codice%', 'cliente obbligatorio');
select test.ok(test.errore($$select public.salva_movimento(null, null,
  '{"direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"NONESISTE","quantita":1}]')$$) like '%foreign key%', 'articolo inesistente');
select test.ok((select count(*) from public.audit_movimenti) = 2, 'i salvataggi falliti non lasciano audit');

-- ---------------------------------------------------------------- operatore: modifica
select test.ok(test.errore($$select public.salva_movimento((select id from m1), 1,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":20}]')$$) is null, 'modifica del proprio movimento');
select test.ok((select versione = 2 and updated_by = '00000000-0000-0000-0000-000000000001' and updated_at is not null
                  and richiesto_da is null
                from public.movimenti where id = (select id from m1)), 'versione 2, autore e data modifica');
select test.ok((select count(*) from public.movimento_righe where movimento_id = (select id from m1)) = 1,
  'riga tolta in modifica');
select test.ok((
  select azione = 'modifica'
     and prima -> 'righe' = '[{"quantita": 15, "articolo_codice": "FED5080T"}, {"quantita": 8, "articolo_codice": "TELO100"}]'::jsonb
     and dopo -> 'righe' = '[{"quantita": 20, "articolo_codice": "FED5080T"}]'::jsonb
     and prima ->> 'richiesto_da' = 'Governante' and dopo ->> 'richiesto_da' is null
  from public.audit_movimenti where movimento_id = (select id from m1) order by id desc limit 1
), 'audit: una sola riga con prima/dopo di testata e righe');

-- Salvataggio identico: nessuna riga di audit in più.
select public.salva_movimento((select id from m1), 2,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":20}]');
select test.ok((select count(*) from public.audit_movimenti where movimento_id = (select id from m1)) = 2,
  'salvataggio senza cambiamenti: niente audit');

-- Modifica simultanea: la versione letta (2) non è più quella attuale (3).
select test.ok(test.errore($$select public.salva_movimento((select id from m1), 2,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":99}]')$$) like 'MOVIMENTO_CAMBIATO%', 'conflitto di versione');
select test.ok((select quantita from public.movimento_righe where movimento_id = (select id from m1)) = 20,
  'il conflitto non sovrascrive');

-- Un altro operatore non modifica i movimenti di Mario.
select test.come('00000000-0000-0000-0000-000000000002');
select test.ok(test.errore($$select public.salva_movimento((select id from m1), 3,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":1}]')$$) like 'PERMESSO_NEGATO%', 'operatore: non modifica gli altrui');
update public.movimenti set note = 'manomesso' where id = (select id from m1);
delete from public.movimento_righe where movimento_id = (select id from m1);
insert into public.movimento_righe (movimento_id, articolo_codice, quantita)
  select id, 'TELO100', 1 from m1 where false;
select test.ok(test.errore($$insert into public.movimento_righe (movimento_id, articolo_codice, quantita)
  values ((select id from m1), 'TELO100', 1)$$) like '%row-level security%', 'operatore: non aggiunge righe altrui');
select test.ok((select note is null from public.movimenti where id = (select id from m1))
  and (select count(*) from public.movimento_righe where movimento_id = (select id from m1)) = 1,
  'operatore: modifiche dirette agli altrui ignorate');
select test.ok((select count(*) from public.movimenti where id = (select id from m1)) = 1,
  'operatore: vede comunque i movimenti altrui');

-- Mario non può annullare.
select test.come('00000000-0000-0000-0000-000000000001');
select test.ok(test.errore($$select public.annulla_movimento((select id from m1), 3, 'errore')$$)
  like 'PERMESSO_NEGATO%', 'operatore: non annulla (funzione)');
select test.ok(test.errore($$update public.movimenti set stato = 'annullato', motivo_annullamento = 'x'
  where id = (select id from m1)$$) similar to '(PERMESSO_NEGATO|%row-level security)%', 'operatore: non annulla (diretto)');

-- Finestra di modifica: movimento registrato 8 giorni fa.
reset role;
alter table public.movimenti disable trigger movimenti_proteggi;
update public.movimenti set created_at = now() - interval '8 days' where id = (select id from m1);
alter table public.movimenti enable trigger movimenti_proteggi;
set role authenticated;
select test.ok(test.errore($$select public.salva_movimento((select id from m1), 3,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":1}]')$$) like 'PERMESSO_NEGATO%', 'operatore: oltre i 7 giorni non modifica');
reset role;
update public.impostazioni set finestra_modifica_giorni = 10;
set role authenticated;
select test.ok(test.errore($$select public.salva_movimento((select id from m1), 3,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":21}]')$$) is null, 'finestra configurabile (10 giorni)');
reset role;
update public.impostazioni set finestra_modifica_giorni = 7;
set role authenticated;

-- ---------------------------------------------------------------- admin
select test.come('00000000-0000-0000-0000-00000000000a');
select test.ok(test.errore($$select public.salva_movimento((select id from m1), 4,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":22}]')$$) is null, 'admin: modifica anche fuori finestra');
select test.ok((select operatore_id from public.movimenti where id = (select id from m1))
  = '00000000-0000-0000-0000-000000000001', 'la modifica dell''admin non cambia l''operatore');
select test.ok(test.errore($$select public.annulla_movimento((select id from m1), 5, '  ')$$)
  like 'MOTIVO_MANCANTE%', 'annullamento senza motivo');
select test.ok(test.errore($$select public.annulla_movimento((select id from m1), 4, 'doppione')$$)
  like 'MOVIMENTO_CAMBIATO%', 'annullamento con versione vecchia');
select public.annulla_movimento((select id from m1), 5, 'Registrato due volte');
select test.ok((select stato = 'annullato' and annullato_da = '00000000-0000-0000-0000-00000000000a'
                  and annullato_il is not null from public.movimenti where id = (select id from m1)),
  'annullamento registrato');
select test.ok((select azione from public.audit_movimenti where movimento_id = (select id from m1)
                order by id desc limit 1) = 'annullamento', 'audit: annullamento');
select test.ok(test.errore($$select public.salva_movimento((select id from m1), 6,
  '{"data":"2026-10-15","direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":1001}',
  '[{"articolo_codice":"FED5080T","quantita":1}]')$$) like 'PERMESSO_NEGATO%', 'un annullato non si modifica');
select test.ok((select count(*) from public.movimenti) = 2, 'admin: vede gli annullati');

select test.come('00000000-0000-0000-0000-000000000001');
select test.ok((select count(*) from public.movimenti) = 1, 'operatore: non vede gli annullati');
select test.ok((select count(*) from public.movimento_righe where movimento_id = (select id from m1)) = 0,
  'operatore: non vede le righe degli annullati');
select test.ok((select count(*) from public.audit_movimenti where movimento_id = (select id from m1)) = 0,
  'operatore: non vede l''audit degli annullati');

select test.come('00000000-0000-0000-0000-00000000000a');
select public.ripristina_movimento((select id from m1), 6);
select test.ok((select stato = 'attivo' and motivo_annullamento is null from public.movimenti where id = (select id from m1)),
  'ripristino');
select test.ok((select azione from public.audit_movimenti where movimento_id = (select id from m1)
                order by id desc limit 1) = 'ripristino', 'audit: ripristino');

-- Nessuno cancella fisicamente un movimento né tocca l'audit.
delete from public.movimenti;
select test.ok((select count(*) from public.movimenti) = 2, 'admin: niente cancellazione fisica');
select test.ok(test.errore('delete from public.audit_movimenti') like 'permission denied%', 'audit non cancellabile');
select test.ok(test.errore($$update public.audit_movimenti set utente_id = null$$) like 'permission denied%',
  'audit non modificabile');
select test.ok(test.errore($$select public._fotografia_movimento(1)$$) like 'permission denied%',
  'funzioni interne non richiamabili');

-- Anagrafiche: l'admin le gestisce; un cliente usato non si cancella.
select test.ok(test.errore($$insert into public.clienti (codice, ragione_sociale, struttura) values (1003, 'Nuovo', 'Hotel Tre')$$)
  is null, 'admin: crea clienti');
select test.ok(test.errore('delete from public.clienti where codice = 1001') like '%foreign key%',
  'cliente con movimenti non cancellabile');
select public.annulla_movimento(id, versione, 'prova') from public.movimenti where cliente_codice = 1001;
update public.clienti set codice = 2001 where codice = 1001;
select test.ok((select cliente_codice = 2001 and versione = 8 from public.movimenti where id = (select id from m1)),
  'cambio codice cliente propagato anche agli annullati, versione invariata');
select public.ripristina_movimento(id, versione) from public.movimenti where id = (select id from m1);

-- ---------------------------------------------------------------- profili
select test.come('00000000-0000-0000-0000-000000000001');
update public.profili set ruolo = 'admin', nome = 'Mario R.' where id = auth.uid();
select test.ok((select ruolo = 'operatore' and nome = 'Mario R.' from public.profili where id = auth.uid()),
  'operatore: cambia il proprio nome ma non il ruolo');
update public.profili set nome = 'hackerato' where email = 'laura@lavanderia.it';
reset role;
select test.ok((select nome from public.profili where email = 'laura@lavanderia.it') = 'laura',
  'operatore: non cambia gli altri profili');
set role authenticated;

select test.come('00000000-0000-0000-0000-00000000000a');
select test.ok(test.errore($$update public.profili set ruolo = 'lettura' where id = auth.uid()$$)
  like 'ULTIMO_ADMIN%', 'resta sempre almeno un admin');
update public.profili set attivo = false where email = 'laura@lavanderia.it';

select test.come('00000000-0000-0000-0000-000000000002');
select test.ok((select count(*) from public.clienti) = 0 and (select count(*) from public.movimenti) = 0,
  'utente disattivato: non vede nulla');
select test.ok(test.errore($$select public.salva_movimento(null, null,
  '{"direzione":"USCITA","causale":"REINTEGRO_INVENTARIO","cliente_codice":2001}',
  '[{"articolo_codice":"FED5080T","quantita":1}]')$$) like '%row-level security%', 'utente disattivato: non registra');

-- Con movimenti reali i dati demo non si generano.
select test.come('00000000-0000-0000-0000-00000000000a');
select test.ok(test.errore('select public.genera_dati_demo()') like 'DATI_REALI_PRESENTI%',
  'demo bloccata se ci sono movimenti reali');
reset role;
