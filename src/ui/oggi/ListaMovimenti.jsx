import { pezzi, puoRegistrare, totaliMovimenti } from '../../data/movimento.js';
import { aggiungiGiorni, formatGiornoEsteso, formatNumero, formatOra, formatSaldo, oggiISO } from '../../lib/formato.js';
import { useApp } from '../contesto.js';
import { BadgeAnnullato, BadgeCausale, BadgeDirezione, COLORI_DIREZIONE } from '../comuni/Etichette.jsx';

/** Movimenti di un giorno con i totali, aggiornati in tempo reale. */
export default function ListaMovimenti({
  giorno, onCambiaGiorno, movimenti, caricamento, evidenziati, onApri, onDuplica, mostraAnnullati, onMostraAnnullati,
}) {
  const { profilo, clientiPerCodice } = useApp();
  const oggi = oggiISO();
  const totali = totaliMovimenti(movimenti);
  const annullati = movimenti.filter((m) => m.stato === 'annullato').length;
  const visibili = mostraAnnullati ? movimenti : movimenti.filter((m) => m.stato === 'attivo');

  return (
    <section aria-label="Movimenti del giorno">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" className="pulsante-secondario w-12 px-0 text-xl" aria-label="Giorno precedente"
          onClick={() => onCambiaGiorno(aggiungiGiorni(giorno, -1))}>‹</button>
        <div className="flex-1 text-center">
          <div className="font-bold first-letter:uppercase">{giorno === oggi ? 'Oggi' : formatGiornoEsteso(giorno)}</div>
          {giorno === oggi && <div className="text-sm text-slate-500">{formatGiornoEsteso(giorno)}</div>}
        </div>
        <button type="button" className="pulsante-secondario w-12 px-0 text-xl" aria-label="Giorno successivo"
          onClick={() => onCambiaGiorno(aggiungiGiorni(giorno, 1))}>›</button>
        {giorno !== oggi && (
          <button type="button" className="pulsante-secondario px-3" onClick={() => onCambiaGiorno(oggi)}>Oggi</button>
        )}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <Totale titolo="Uscite" colore="text-orange-700" pezzi={totali.uscite.pezzi} movimenti={totali.uscite.movimenti} />
        <Totale titolo="Entrate" colore="text-sky-800" pezzi={totali.entrate.pezzi} movimenti={totali.entrate.movimenti} />
        <div className="scheda px-2 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saldo</div>
          <div className="text-2xl font-bold">{formatSaldo(totali.saldo)}</div>
          <div className="text-xs text-slate-500">pezzi</div>
        </div>
      </div>

      {annullati > 0 && (
        <label className="mb-2 flex min-h-10 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-5 w-5" checked={mostraAnnullati}
            onChange={(e) => onMostraAnnullati(e.target.checked)} />
          Mostra annullati ({annullati})
        </label>
      )}

      {caricamento && <p className="py-8 text-center text-slate-500">Caricamento…</p>}
      {!caricamento && visibili.length === 0 && (
        <p className="scheda py-8 text-center text-slate-500">Nessun movimento in questo giorno.</p>
      )}

      <ul className="space-y-2">
        {visibili.map((m) => {
          const cliente = clientiPerCodice.get(m.cliente_codice);
          const annullato = m.stato === 'annullato';
          return (
            <li
              key={m.id}
              className={`scheda overflow-hidden border-l-4 ${COLORI_DIREZIONE[m.direzione].bordo} ${
                evidenziati.has(m.id) ? 'appena-cambiato' : ''
              } ${annullato ? 'opacity-60' : ''}`}
            >
              <div className="flex">
                <button type="button" className="min-w-0 flex-1 px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => onApri(m.id)}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-slate-500">{formatOra(m.created_at)}</span>
                    <BadgeDirezione direzione={m.direzione} />
                    <BadgeCausale causale={m.causale} />
                    {annullato && <BadgeAnnullato />}
                    <span className="ml-auto text-sm text-slate-500">n° {m.id}</span>
                  </div>
                  <div className={`mt-1 truncate font-semibold ${annullato ? 'line-through' : ''}`}>
                    {cliente ? cliente.struttura : `Cliente ${m.cliente_codice}`}
                    <span className="ml-2 font-normal text-slate-500">cod. {m.cliente_codice}</span>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-slate-600">
                    {m.righe.map((r) => `${r.articolo_codice} ×${formatNumero(r.quantita)}`).join(' · ')}
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs text-slate-500">
                    <span>{m.operatore?.nome ?? ''}{m.richiesto_da ? ` · richiesto da ${m.richiesto_da}` : ''}</span>
                    <span className="font-semibold text-slate-700">{formatNumero(pezzi(m))} pz</span>
                  </div>
                </button>
                {puoRegistrare(profilo) && !annullato && (
                  <button
                    type="button"
                    className="w-16 shrink-0 border-l border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => onDuplica(m)}
                    title="Copia questo movimento nel form"
                  >
                    Duplica
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Totale({ titolo, colore, pezzi: quanti, movimenti }) {
  return (
    <div className="scheda px-2 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titolo}</div>
      <div className={`text-2xl font-bold ${colore}`}>{formatNumero(quanti)}</div>
      <div className="text-xs text-slate-500">pezzi · {movimenti} mov.</div>
    </div>
  );
}
