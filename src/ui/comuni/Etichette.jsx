import { ETICHETTE_CAUSALE, ETICHETTE_DIREZIONE } from '../../data/tipi.js';

export const COLORI_DIREZIONE = {
  USCITA: {
    pieno: 'bg-orange-600 text-white border-orange-600',
    tenue: 'bg-orange-100 text-orange-900',
    bordo: 'border-l-orange-500',
  },
  ENTRATA: {
    pieno: 'bg-sky-700 text-white border-sky-700',
    tenue: 'bg-sky-100 text-sky-900',
    bordo: 'border-l-sky-600',
  },
};

export function BadgeDirezione({ direzione }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${COLORI_DIREZIONE[direzione].tenue}`}>
      {direzione === 'USCITA' ? '↑' : '↓'} {ETICHETTE_DIREZIONE[direzione]}
    </span>
  );
}

export function BadgeCausale({ causale }) {
  const evidente = causale === 'REINTEGRO_INVENTARIO';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${evidente ? 'bg-red-100 text-red-900' : 'bg-slate-100 text-slate-700'}`}>
      {ETICHETTE_CAUSALE[causale]}
    </span>
  );
}

export function BadgeAnnullato() {
  return (
    <span className="inline-flex items-center rounded bg-slate-700 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
      Annullato
    </span>
  );
}
