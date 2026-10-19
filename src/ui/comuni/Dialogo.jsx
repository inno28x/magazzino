import { useEffect, useRef } from 'react';

/** Finestra modale. Esc o clic sullo sfondo chiudono (se onChiudi c'è). */
export default function Dialogo({ titolo, children, azioni, onChiudi, larghezza = 'max-w-lg' }) {
  const pannello = useRef(null);

  useEffect(() => {
    const precedente = document.activeElement;
    const primo = ['textarea', 'input', 'button[data-predefinito]', 'button']
      .map((selettore) => pannello.current?.querySelector(selettore))
      .find(Boolean);
    primo?.focus();
    return () => precedente?.focus?.();
  }, []);

  useEffect(() => {
    if (!onChiudi) return undefined;
    const tasto = (e) => { if (e.key === 'Escape') onChiudi(); };
    window.addEventListener('keydown', tasto);
    return () => window.removeEventListener('keydown', tasto);
  }, [onChiudi]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi?.(); }}
    >
      <div
        ref={pannello}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titolo-dialogo"
        className={`scheda w-full ${larghezza} max-h-[90vh] overflow-y-auto p-5`}
      >
        <h2 id="titolo-dialogo" className="mb-3 text-lg font-bold">{titolo}</h2>
        <div className="text-slate-700">{children}</div>
        {azioni && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{azioni}</div>}
      </div>
    </div>
  );
}
