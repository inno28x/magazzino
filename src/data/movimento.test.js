import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bozzaVuota, bozzaDaMovimento, bozzaDuplicata, conDirezione, leggiQuantita, aggiungiRiga,
  validaBozza, totaliMovimenti, puoModificare, puoRegistrare, differenze,
} from './movimento.js';
import { cercaClienti, cercaArticoli } from './ricerca.js';
import { traduciErrore } from './errori.js';

const movimento = {
  id: 7, versione: 3, data: '2026-10-15', direzione: 'USCITA', causale: 'REINTEGRO_INVENTARIO',
  cliente_codice: 1001, richiesto_da: null, note: 'urgente', operatore_id: 'mario',
  stato: 'attivo', created_at: '2026-10-15T08:00:00Z',
  righe: [{ articolo_codice: 'FED5080T', quantita: 20 }, { articolo_codice: 'TELO100', quantita: 5 }],
};

test('bozze: nuova, modifica, duplicato', () => {
  const nuova = bozzaVuota('2026-10-19');
  assert.equal(nuova.id, null);
  assert.deepEqual(nuova.righe, []);

  const modifica = bozzaDaMovimento(movimento);
  assert.equal(modifica.id, 7);
  assert.equal(modifica.versione, 3);
  assert.equal(modifica.richiesto_da, '');
  modifica.righe[0].quantita = 1;
  assert.equal(movimento.righe[0].quantita, 20, 'le righe sono copiate, non condivise');

  const copia = bozzaDuplicata(movimento, '2026-10-19');
  assert.equal(copia.id, null);
  assert.equal(copia.versione, null);
  assert.equal(copia.data, '2026-10-19');
  assert.equal(copia.righe.length, 2);
});

test('cambiare direzione azzera una causale non più valida', () => {
  const b = { ...bozzaVuota('2026-10-19', 'USCITA'), causale: 'REINTEGRO_INVENTARIO' };
  assert.equal(conDirezione(b, 'ENTRATA').causale, null);
  assert.equal(conDirezione({ ...b, causale: 'ALTRO' }, 'ENTRATA').causale, 'ALTRO');
});

test('quantità: solo interi positivi', () => {
  assert.equal(leggiQuantita('12'), 12);
  assert.equal(leggiQuantita(' 3 '), 3);
  assert.equal(leggiQuantita(5), 5);
  for (const v of ['0', '-2', '2,5', '2.5', '', 'abc', null, undefined, '1e3']) {
    assert.equal(leggiQuantita(v), null, `"${v}" non valida`);
  }
});

test('stesso articolo aggiunto due volte: quantità sommate', () => {
  let righe = aggiungiRiga([], 'FED5080T', 10);
  righe = aggiungiRiga(righe, 'TELO100', 4);
  righe = aggiungiRiga(righe, 'FED5080T', 5);
  assert.deepEqual(righe, [
    { articolo_codice: 'FED5080T', quantita: 15 },
    { articolo_codice: 'TELO100', quantita: 4 },
  ]);
});

test('validazione', () => {
  const vuota = validaBozza(bozzaVuota('2026-10-19'));
  assert.equal(vuota.valida, false);
  assert.deepEqual(Object.keys(vuota.errori).sort(), ['causale', 'cliente', 'direzione', 'righe']);

  const ok = validaBozza(bozzaDaMovimento(movimento));
  assert.equal(ok.valida, true);

  const incoerente = validaBozza({ ...bozzaDaMovimento(movimento), causale: 'RITIRO_INVENTARIO' });
  assert.match(incoerente.errori.causale, /non è valida/);

  const zero = validaBozza({ ...bozzaDaMovimento(movimento), righe: [{ articolo_codice: 'X', quantita: 0 }] });
  assert.match(zero.errori.righe, /maggiori di zero/);

  const data = validaBozza({ ...bozzaDaMovimento(movimento), data: '' });
  assert.ok(data.errori.data);
});

test('totali escludono gli annullati', () => {
  const t = totaliMovimenti([
    movimento,
    { ...movimento, direzione: 'ENTRATA', causale: 'RITIRO_INVENTARIO', righe: [{ articolo_codice: 'X', quantita: 8 }] },
    { ...movimento, stato: 'annullato' },
  ]);
  assert.deepEqual(t, { uscite: { movimenti: 1, pezzi: 25 }, entrate: { movimenti: 1, pezzi: 8 }, saldo: 17 });
});

test('permessi di modifica come nel database', () => {
  const adesso = new Date('2026-10-19T08:00:00Z');
  const mario = { id: 'mario', ruolo: 'operatore', attivo: true };
  const laura = { id: 'laura', ruolo: 'operatore', attivo: true };
  const admin = { id: 'anna', ruolo: 'admin', attivo: true };
  const lettore = { id: 'luca', ruolo: 'lettura', attivo: true };
  assert.equal(puoModificare(movimento, mario, 7, adesso), true);
  assert.equal(puoModificare(movimento, laura, 7, adesso), false);
  assert.equal(puoModificare(movimento, lettore, 7, adesso), false);
  assert.equal(puoModificare(movimento, mario, 3, adesso), false, 'oltre la finestra');
  assert.equal(puoModificare({ ...movimento, created_at: '2026-09-01T00:00:00Z' }, admin, 7, adesso), true);
  assert.equal(puoModificare({ ...movimento, stato: 'annullato' }, admin, 7, adesso), false);
  assert.equal(puoModificare(movimento, { ...mario, attivo: false }, 7, adesso), false);
  assert.equal(puoRegistrare(mario), true);
  assert.equal(puoRegistrare(lettore), false);
  assert.equal(puoRegistrare(null), false);
});

test('differenze per lo storico', () => {
  const prima = { ...movimento, richiesto_da: 'Governante' };
  const dopo = {
    ...movimento,
    richiesto_da: null,
    righe: [{ articolo_codice: 'FED5080T', quantita: 30 }, { articolo_codice: 'ASC60', quantita: 2 }],
  };
  assert.deepEqual(differenze(prima, dopo), {
    campi: [{ campo: 'richiesto_da', da: 'Governante', a: null }],
    righe: [
      { articolo_codice: 'ASC60', da: null, a: 2 },
      { articolo_codice: 'FED5080T', da: 20, a: 30 },
      { articolo_codice: 'TELO100', da: 5, a: null },
    ],
  });
  assert.equal(differenze(null, movimento).righe.length, 2, 'creazione: tutte le righe nuove');
});

const clienti = [
  { codice: 1001, struttura: 'Grand Hotel Riviera', ragione_sociale: 'Riviera Hotels S.p.A.', gruppo: { nome: 'Catena Tirreno' }, zona: 'Versilia', attivo: true },
  { codice: 1002, struttura: 'Hotel Riviera Lido', ragione_sociale: 'Riviera Hotels S.p.A.', gruppo: { nome: 'Catena Tirreno' }, zona: 'Versilia', attivo: true },
  { codice: 2100, struttura: "Palazzo sull'Arno", ragione_sociale: 'Palazzo Arno S.r.l.', gruppo: null, zona: 'Firenze', attivo: true },
  { codice: 1003, struttura: 'Hotel Chiuso', ragione_sociale: 'Vecchio S.r.l.', gruppo: null, zona: 'Lucca', attivo: false },
];

test('ricerca clienti per codice o nome', () => {
  assert.deepEqual(cercaClienti(clienti, '1002').map((c) => c.codice), [1002]);
  assert.deepEqual(cercaClienti(clienti, '100').map((c) => c.codice), [1001, 1002], 'non attivi esclusi');
  assert.deepEqual(cercaClienti(clienti, 'riviera').map((c) => c.codice), [1001, 1002]);
  assert.deepEqual(cercaClienti(clienti, 'lido riv').map((c) => c.codice), [1002]);
  assert.deepEqual(cercaClienti(clienti, 'tirreno').length, 2, 'cerca anche nel gruppo');
  assert.deepEqual(cercaClienti(clienti, "sull'arno").map((c) => c.codice), [2100]);
  assert.deepEqual(cercaClienti(clienti, '   '), []);
});

const articoli = [
  { codice: 'FED5080', descrizione: 'Federa 50x80', categoria: 'federe', attivo: true },
  { codice: 'FED5080T', descrizione: 'Federa 50x80 RFID', categoria: 'federe', attivo: true },
  { codice: 'TELO100', descrizione: 'Telo bagno 100x150', categoria: 'spugna', attivo: true },
  { codice: 'OLD1', descrizione: 'Federa vecchia', categoria: 'federe', attivo: false },
];

test('ricerca articoli per codice o descrizione', () => {
  assert.deepEqual(cercaArticoli(articoli, 'fed5080t').map((a) => a.codice), ['FED5080T']);
  assert.deepEqual(cercaArticoli(articoli, 'FED5080').map((a) => a.codice), ['FED5080', 'FED5080T'], 'esatto prima');
  assert.deepEqual(cercaArticoli(articoli, 'federa rfid').map((a) => a.codice), ['FED5080T']);
  assert.deepEqual(cercaArticoli(articoli, 'spugna').map((a) => a.codice), ['TELO100']);
  assert.deepEqual(cercaArticoli(articoli, 'vecchia'), []);
});

test('errori tradotti', () => {
  const conflitto = traduciErrore({ message: 'MOVIMENTO_CAMBIATO', details: 'Modificato da altri.' });
  assert.equal(conflitto.codice, 'MOVIMENTO_CAMBIATO');
  assert.equal(conflitto.message, 'Modificato da altri.');
  assert.equal(traduciErrore({ message: 'new row violates row-level security policy for table "movimenti"', code: '42501' }).codice, 'PERMESSO_NEGATO');
  assert.equal(traduciErrore({ message: 'Invalid login credentials' }).message, 'Email o password non corretti.');
  assert.equal(traduciErrore(new TypeError('Failed to fetch')).codice, 'RETE');
});
