export default function Caricamento({ testo = 'Caricamento…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500" role="status">
      {testo}
    </div>
  );
}
