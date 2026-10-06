// Mileage report for one month: per pharmacist, the days worked away from base and what the miles pay. The sums live in app3/mileage.ts.
import { record } from "../../diagnostics.ts";
import { useMemo, useRef, useState } from "react";
import { isValidDate, type DomainState, type ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, Chip } from "../../ui/primitives.tsx";
import { Title } from "../chrome/Title.tsx";
import { dollars, mileageCsv, mileageReport, type UnknownTrip } from "../../mileage.ts";
import { monthLabel, shiftMonth, shortDate } from "./travel-util.ts";

const field = "h-8 rounded-md border border-edge bg-white px-2 text-sm tabular-nums";

export function MileageReport({ state, initialMonth, onAddPair }: { state: DomainState; initialMonth: string; onAddPair: (from: string, to: string) => void }) {
  const [month, setMonth] = useState(initialMonth);
  const report = useMemo(() => mileageReport(state, /^\d{4}-\d{2}$/.test(month) ? month : initialMonth), [state, month, initialMonth]);
  const code = (id: string | null) => (id ? state.stores[id]?.code ?? id : "none");
  const [csv, setCsv] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const say = useApp((s) => s.say);

  const copy = async () => {
    const text = mileageCsv(state, report);
    try {
      await navigator.clipboard.writeText(text);
      say("ok", "Copied the mileage report as CSV.");
      setCsv(null);
    } catch (e) {
      record("ui", `clipboard blocked (mileage): ${String((e as Error)?.message ?? e)}`);
      // No clipboard access here: show the text so it can be selected and copied by hand.
      setCsv(text);
      setTimeout(() => { area.current?.focus(); area.current?.select(); }, 0);
    }
  };

  const milesUnknown = report.unknown.filter((u) => u.reason === "miles");
  const otherUnknown = report.unknown.filter((u) => u.reason !== "miles");
  const noRate = state.config.mileageRates.length === 0;

  return (
    <section aria-labelledby="mileage-h" className="mt-8">
      <Title id="mileage-h" as="h2" className="text-base font-semibold" tip="Days a pharmacist worked away from their base store. | Pay is 2 x (one-way miles over the free miles) x the rate, only when one-way miles are over the free miles. | Drive times that are not known are listed apart and are not counted as zero.">Mileage report</Title>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">◀ Previous</Btn>
        <label className="flex items-center gap-1.5 text-xs font-semibold">
          Month
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={field} />
        </label>
        <Btn onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">Next ▶</Btn>
        <span className="ml-1 text-sm font-semibold" data-testid="mileage-total">
          {monthLabel(report.month)}: {dollars(report.totals.cents)} over {report.totals.trips} {report.totals.trips === 1 ? "trip" : "trips"}
        </span>
        <span className="flex-1" />
        <Btn onClick={copy}>Copy as CSV</Btn>
      </div>

      {csv !== null && (
        <div className="mt-2">
          <label className="text-xs font-semibold" htmlFor="csv-text">Copy this text by hand (the browser did not allow copying)</label>
          <textarea id="csv-text" ref={area} readOnly value={csv} rows={6} onFocus={(e) => e.currentTarget.select()} className="mt-0.5 w-full rounded-md border border-edge bg-white p-2 font-mono text-xs" />
          <Btn tone="ghost" onClick={() => setCsv(null)}>Hide</Btn>
        </div>
      )}

      <RateSettings state={state} />

      {noRate && (
        <p className="mt-2 rounded-md bg-warn-bg px-2 py-1 text-xs font-semibold text-warn" role="status">▲ No mileage rate is set yet, so nothing can be priced. Add one above.</p>
      )}

      {report.rows.length === 0 && report.unknown.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nobody worked away from their base store in {monthLabel(report.month)}.</p>
      ) : (
        <table className="mt-3 w-full border-collapse text-sm" aria-label={`Mileage for ${monthLabel(report.month)}`}>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-1 pr-2 font-semibold">Pharmacist and day</th>
              <th scope="col" className="px-2 font-semibold">To</th>
              <th scope="col" className="px-2 text-right font-semibold">One-way miles</th>
              <th scope="col" className="px-2 text-right font-semibold">Over free</th>
              <th scope="col" className="px-2 text-right font-semibold">Rate</th>
              <th scope="col" className="pl-2 text-right font-semibold">Pay</th>
            </tr>
          </thead>
          {report.rows.map((r) => (
            <tbody key={r.pharmacistId} data-pharmacist={r.pharmacistId}>
              <tr className="bg-fill">
                <th scope="rowgroup" colSpan={5} className="py-1 pl-1 text-left font-semibold">
                  {r.name} <span className="font-normal text-muted">(base {code(r.baseStoreId)}, {r.trips.length} {r.trips.length === 1 ? "day" : "days"} away)</span>
                </th>
                <td className="py-1 pr-0 text-right font-semibold tabular-nums">{dollars(r.cents)}</td>
              </tr>
              {r.trips.map((t) => (
                <tr key={t.assignmentId} className="border-b border-line/60">
                  <td className="py-0.5 pl-4">{shortDate(t.date)}</td>
                  <td className="px-2">{code(t.storeId)}</td>
                  <td className="px-2 text-right tabular-nums">{t.oneWayMiles}</td>
                  <td className="px-2 text-right tabular-nums">{t.paidOneWayMiles > 0 ? Math.round(t.paidOneWayMiles * 10) / 10 : "within free"}</td>
                  <td className="px-2 text-right tabular-nums">{t.rateCents}c</td>
                  <td className="pl-2 text-right tabular-nums">{dollars(t.cents)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}

      {milesUnknown.length > 0 && (
        <div className="mt-4 rounded-md border border-warn/35 bg-warn-bg/40 p-3" role="region" aria-label="Miles not known">
          <h3 className="text-sm font-semibold"><Chip tone="info">?</Chip> Miles not known</h3>
          <p className="text-xs text-muted">These days are not in the total. Add the drive time and they are counted.</p>
          <ul className="mt-1.5 space-y-1">
            {milesUnknown.map((u) => (
              <li key={u.assignmentId} className="flex items-center gap-2 text-sm">
                <span>{u.name}: {shortDate(u.date)}, {code(u.baseStoreId)} to {code(u.storeId)}</span>
                <Btn className="h-7" onClick={() => u.baseStoreId && onAddPair(u.baseStoreId, u.storeId)}>Add</Btn>
              </li>
            ))}
          </ul>
        </div>
      )}
      {otherUnknown.length > 0 && <OtherUnknown list={otherUnknown} code={code} />}
    </section>
  );
}

function OtherUnknown({ list, code }: { list: UnknownTrip[]; code: (id: string | null) => string }) {
  const setView = useApp((s) => s.setView);
  const noBase = list.filter((u) => u.reason === "base");
  const noRate = list.filter((u) => u.reason === "rate");
  return (
    <div className="mt-3 text-sm">
      {noRate.length > 0 && <p><Chip tone="warning">▲</Chip> {noRate.length} {noRate.length === 1 ? "day has" : "days have"} no mileage rate in effect, so {noRate.length === 1 ? "it is" : "they are"} not priced. Add a rate that starts on or before {shortDate(noRate[0]!.date)}.</p>}
      {noBase.length > 0 && (
        <p className="mt-1">
          <Chip tone="warning">▲</Chip> {[...new Set(noBase.map((u) => u.name))].join(", ")} {new Set(noBase.map((u) => u.name)).size === 1 ? "has" : "have"} no base store, so mileage cannot be worked out ({code(noBase[0]!.storeId)} and others).{" "}
          <Btn className="h-7" onClick={() => setView("setup")}>Open Setup</Btn>
        </p>
      )}
    </div>
  );
}

/** Free miles and the dated rates, edited in place through config.set. */
function RateSettings({ state }: { state: DomainState }) {
  const commit = useApp((s) => s.commit);
  const cfg = state.config;
  const rates = useMemo(() => [...cfg.mileageRates].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0)), [cfg.mileageRates]);
  const [free, setFree] = useState(String(cfg.mileageFreeMiles));
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [newDate, setNewDate] = useState("");
  const [newCents, setNewCents] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const num = (s: string): number | null => (/^\d{1,4}(\.\d{1,2})?$/.test(s.trim()) ? Number(s.trim()) : null);

  const saveFree = () => {
    const n = num(free);
    if (n === null) { setErr("Free miles must be a number such as 20."); return; }
    setErr(null);
    commit([{ t: "config.set", patch: { mileageFreeMiles: n } }], "Changed the free miles.");
  };
  const saveRate = (date: ISODate) => {
    const n = num(edits[date] ?? "");
    if (n === null || n <= 0) { setErr("A rate is cents per mile, a number above 0, such as 70."); return; }
    setErr(null);
    commit([{ t: "config.set", patch: { mileageRates: rates.map((r) => (r.effectiveFrom === date ? { ...r, centsPerMile: n } : r)) } }], "Changed a mileage rate.");
    setEdits(({ [date]: _drop, ...rest }) => rest);
  };
  const addRate = () => {
    const n = num(newCents);
    if (!isValidDate(newDate)) { setErr("Pick the date the new rate starts."); return; }
    if (n === null || n <= 0) { setErr("A rate is cents per mile, a number above 0, such as 70."); return; }
    if (rates.some((r) => r.effectiveFrom === newDate)) { setErr("There is already a rate that starts on that date. Change it in the list."); return; }
    setErr(null);
    if (commit([{ t: "config.set", patch: { mileageRates: [...rates, { effectiveFrom: newDate, centsPerMile: n }] } }], `Added a mileage rate from ${newDate}.`)) {
      setNewDate("");
      setNewCents("");
    }
  };

  return (
    <div className="mt-3 rounded-md border border-line bg-cream p-3" role="group" aria-label="Mileage settings">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs font-semibold">
            Free miles (one way, not paid)
            <input value={free} onChange={(e) => setFree(e.target.value)} inputMode="decimal" className={`${field} w-24`} />
          </label>
          <Btn disabled={free.trim() === String(cfg.mileageFreeMiles)} onClick={saveFree}>Save</Btn>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold">Rate, cents per mile (the latest start date on or before the day applies)</span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {rates.length === 0 && <li className="text-xs text-muted">No rate yet.</li>}
            {rates.map((r) => {
              const v = edits[r.effectiveFrom] ?? String(r.centsPerMile);
              return (
                <li key={r.effectiveFrom} className="flex items-center gap-1.5 text-sm">
                  from {r.effectiveFrom}
                  <input aria-label={`Rate from ${r.effectiveFrom}, cents per mile`} value={v} onChange={(e) => setEdits({ ...edits, [r.effectiveFrom]: e.target.value })} inputMode="decimal" className={`${field} w-20`} />
                  <Btn className="h-7" disabled={v.trim() === String(r.centsPerMile)} onClick={() => saveRate(r.effectiveFrom)}>Save</Btn>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs font-semibold">
          New rate starts
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-semibold">
          Cents per mile
          <input value={newCents} onChange={(e) => setNewCents(e.target.value)} inputMode="decimal" className={`${field} w-24`} />
        </label>
        <Btn onClick={addRate}>Add rate</Btn>
      </div>
      {err && <p role="alert" className="mt-1.5 text-xs font-semibold text-illegal">▲ {err}</p>}
    </div>
  );
}
