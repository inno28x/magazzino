const COLORI = {
  ok: 'bg-emerald-700 text-white',
  errore: 'bg-red-700 text-white',
  info: 'bg-slate-800 text-white',
};

/** Messaggi brevi in basso ("Movimento registrato"), che spariscono da soli. */
export default function Avvisi({ avvisi, onChiudi }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {avvisi.map((a) => (
        <div
          key={a.id}
          className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg px-4 py-3 shadow-lg ${COLORI[a.tipo] ?? COLORI.info}`}
        >
          <span className="flex-1">{a.testo}</span>
          <button type="button" className="-my-1 px-2 text-xl leading-none opacity-80 hover:opacity-100"
            aria-label="Chiudi" onClick={() => onChiudi(a.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
