import { useEffect, useId, useState } from 'react';

/**
 * Campo di ricerca con elenco di suggerimenti.
 * Frecce su/giù per scegliere, Invio per confermare, Esc per chiudere.
 */
export default function Combobox({
  etichetta,
  testo,
  onCambiaTesto,
  risultati,
  chiave,
  rendiRisultato,
  onSeleziona,
  placeholder,
  inputRef,
  errore,
  nessunRisultato = 'Nessun risultato',
  className = '',
}) {
  const id = useId();
  const [aperto, setAperto] = useState(false);
  const [evidenziato, setEvidenziato] = useState(0);

  useEffect(() => setEvidenziato(0), [testo]);

  const mostra = aperto && testo.trim().length > 0;

  function scegli(elemento) {
    setAperto(false);
    onSeleziona(elemento);
  }

  function tasto(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAperto(true);
      setEvidenziato((i) => Math.min(i + 1, risultati.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setEvidenziato((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (mostra && risultati.length > 0) {
        e.preventDefault();
        scegli(risultati[Math.min(evidenziato, risultati.length - 1)]);
      }
    } else if (e.key === 'Escape') {
      setAperto(false);
    }
  }

  return (
    <div className={`relative ${className}`}>
      {etichetta && <label htmlFor={id} className="etichetta">{etichetta}</label>}
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={mostra}
        aria-controls={`${id}-elenco`}
        aria-invalid={errore ? true : undefined}
        autoComplete="off"
        spellCheck={false}
        className={`campo ${errore ? 'border-red-500' : ''}`}
        placeholder={placeholder}
        value={testo}
        onChange={(e) => { onCambiaTesto(e.target.value); setAperto(true); }}
        onFocus={() => setAperto(true)}
        onBlur={() => setAperto(false)}
        onKeyDown={tasto}
      />
      {mostra && (
        <ul
          id={`${id}-elenco`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        >
          {risultati.length === 0 && <li className="px-3 py-3 text-slate-500">{nessunRisultato}</li>}
          {risultati.map((r, i) => (
            <li
              key={chiave(r)}
              role="option"
              aria-selected={i === evidenziato}
              className={`cursor-pointer px-3 py-2.5 ${i === evidenziato ? 'bg-slate-100' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setEvidenziato(i)}
              onClick={() => scegli(r)}
            >
              {rendiRisultato(r)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
