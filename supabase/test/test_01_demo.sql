-- Dati demo: generazione e cancellazione.
set role authenticated;
select test.come('00000000-0000-0000-0000-000000000001');
select test.ok(test.errore('select public.genera_dati_demo()') like 'PERMESSO_NEGATO%',
  'un operatore non genera dati demo');

select test.come('00000000-0000-0000-0000-00000000000a');
select public.genera_dati_demo();
select test.ok((select count(*) from public.clienti where demo) = 15, '15 clienti demo');
select test.ok((select count(*) from public.articoli where demo) = 30, '30 articoli demo');
select test.ok((select count(*) from public.movimenti where demo) > 300,
  'almeno 300 movimenti in 3 mesi');
select test.ok((select min(data) from public.movimenti) <= current_date - 85, 'copre 3 mesi');
select test.ok(not exists (
  select 1 from public.movimenti m where not exists (select 1 from public.movimento_righe r where r.movimento_id = m.id)
), 'ogni movimento ha righe');
select test.ok((select bool_and(operatore_id = '00000000-0000-0000-0000-00000000000a') from public.movimenti),
  'operatore = admin che li genera');
select test.ok((select count(*) from public.audit_movimenti) = 0, 'niente audit per i dati demo');
select test.ok((select rfid and codice_base = 'DEMO-FED5080' from public.articoli where codice = 'DEMO-FED5080T'),
  'variante RFID riconosciuta');
-- Il cliente "problematico" deve emergere.
select test.ok((
  select cliente_codice from public.movimenti m join public.movimento_righe r on r.movimento_id = m.id
  where causale = 'REINTEGRO_INVENTARIO' group by 1 order by sum(quantita) desc limit 1
) in (990001, 990014, 990005), 'un cliente problematico è primo per reintegri');
-- Hotel grandi solo RFID (dove esiste la variante), piccoli solo senza tag.
select test.ok(not exists (
  select 1 from public.movimenti m join public.movimento_righe r on r.movimento_id = m.id
  where m.cliente_codice = 990001 and r.articolo_codice in ('DEMO-FED5080', 'DEMO-TELO100')
), 'hotel grande usa articoli RFID');
select test.ok(test.errore('select public.genera_dati_demo()') like 'DEMO_GIA_PRESENTI%',
  'non si generano due volte');

select public.cancella_dati_demo();
reset role;
select test.ok((select count(*) from public.movimenti) = 0, 'movimenti demo cancellati');
select test.ok((select count(*) from public.clienti) + (select count(*) from public.articoli)
  + (select count(*) from public.gruppi) = 0, 'anagrafiche demo cancellate');
