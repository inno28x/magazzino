import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNumero, formatSaldo, formatData, formatOra, formatDataOra, oggiISO,
  aggiungiGiorni, formatGiornoEsteso, normalizzaTesto,
} from './formato.js';

test('numeri all\'italiana', () => {
  assert.equal(formatNumero(0), '0');
  assert.equal(formatNumero(999), '999');
  assert.equal(formatNumero(1234), '1.234');
  assert.equal(formatNumero(1234567), '1.234.567');
  assert.equal(formatNumero(1234.56, 2), '1.234,56');
  assert.equal(formatNumero(-1234), '-1.234');
  assert.equal(formatNumero(null), '–');
  assert.equal(formatSaldo(1500), '+1.500');
  assert.equal(formatSaldo(-20), '-20');
  assert.equal(formatSaldo(0), '0');
});

test('date gg/mm/aaaa nel fuso di Roma', () => {
  assert.equal(formatData('2026-03-05'), '05/03/2026');
  // 23:30 UTC del 31/12 è già il 1° gennaio a Roma.
  assert.equal(formatData('2026-12-31T23:30:00Z'), '01/01/2027');
  assert.equal(formatOra('2026-07-01T08:05:00Z'), '10:05'); // ora legale
  assert.equal(formatOra('2026-01-15T08:05:00Z'), '09:05'); // ora solare
  assert.equal(formatDataOra('2026-01-15T08:05:00Z'), '15/01/2026 09:05');
  assert.equal(oggiISO(new Date('2026-10-18T22:30:00Z')), '2026-10-19');
});

test('calcolo e nomi dei giorni', () => {
  assert.equal(aggiungiGiorni('2026-02-28', 1), '2026-03-01');
  assert.equal(aggiungiGiorni('2026-03-01', -1), '2026-02-28');
  assert.equal(aggiungiGiorni('2026-10-25', 1), '2026-10-26'); // cambio ora
  assert.equal(formatGiornoEsteso('2026-10-19'), 'lunedì 19 ottobre 2026');
});

test('normalizzazione per la ricerca', () => {
  assert.equal(normalizzaTesto("  Palazzo sull'Arno "), 'palazzo sull arno');
  assert.equal(normalizzaTesto('Maître Città'), 'maitre citta');
});
