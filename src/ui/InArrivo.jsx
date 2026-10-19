/** Segnaposto per le schermate delle prossime fasi. */
export default function InArrivo({ titolo, descrizione }) {
  return (
    <div className="scheda mx-auto mt-8 max-w-xl p-8 text-center">
      <h1 className="text-xl font-bold">{titolo}</h1>
      <p className="mt-2 text-slate-600">{descrizione}</p>
      <p className="mt-4 text-sm text-slate-500">In arrivo nelle prossime fasi di sviluppo.</p>
    </div>
  );
}
