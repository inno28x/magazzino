// Formati italiani: 1.234,56 — gg/mm/aaaa. Il fuso è sempre Europe/Rome,
// anche se il tablet è impostato diversamente.

const FUSO = 'Europe/Rome';

/** 1234.5 → "1.234,5" (sempre col punto delle migliaia, anche a 4 cifre). */
export function formatNumero(n, decimali = 0) {
  if (n == null || Number.isNaN(Number(n))) return '–';
  const valore = Number(n);
  const segno = valore < 0 ? '-' : '';
  const [intero, decimale] = Math.abs(valore).toFixed(decimali).split('.');
  const conPunti = intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return segno + conPunti + (decimale ? ',' + decimale : '');
}

/** Come formatNumero ma con il segno + per i positivi (saldi). */
export function formatSaldo(n) {
  if (n == null || Number.isNaN(Number(n))) return '–';
  return (n > 0 ? '+' : '') + formatNumero(n);
}

function parti(valore, opzioni) {
  const data = valore instanceof Date ? valore : new Date(valore);
  const out = {};
  for (const p of new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, ...opzioni }).formatToParts(data)) {
    out[p.type] = p.value;
  }
  return out;
}

/** "2026-10-15" (data senza ora) o un timestamp → "15/10/2026". */
export function formatData(valore) {
  if (!valore) return '';
  if (typeof valore === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    const [a, m, g] = valore.split('-');
    return `${g}/${m}/${a}`;
  }
  const p = parti(valore, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.day}/${p.month}/${p.year}`;
}

/** Timestamp → "10:32". */
export function formatOra(valore) {
  if (!valore) return '';
  const p = parti(valore, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}:${p.minute}`;
}

/** Timestamp → "15/10/2026 10:32". */
export function formatDataOra(valore) {
  if (!valore) return '';
  return `${formatData(valore)} ${formatOra(valore)}`;
}

/** Data di oggi a Roma, "aaaa-mm-gg". */
export function oggiISO(adesso = new Date()) {
  const p = parti(adesso, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** "2026-10-15" + 1 → "2026-10-16". */
export function aggiungiGiorni(iso, giorni) {
  const [a, m, g] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g + giorni));
  return d.toISOString().slice(0, 10);
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** "2026-10-19" → "lunedì 19 ottobre 2026". */
export function formatGiornoEsteso(iso) {
  const [a, m, g] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  return `${GIORNI[d.getUTCDay()]} ${g} ${MESI[m - 1]} ${a}`;
}

/** Testo per confronti di ricerca: minuscolo, senza accenti e apostrofi. */
export function normalizzaTesto(testo) {
  return String(testo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, ' ')
    .toLowerCase()
    .trim();
}
