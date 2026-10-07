// One day in full: who is off, who asked, which stores are left empty or short (and why), and who could be called for each.
import { useMemo } from "react";
import { addDays, weekday, type ISODate, type Unavailability } from "@domain";
import { useApp } from "../../store.ts";
import { evaluateCached } from "../../derive.ts";
import { fmtDate } from "../../copy.ts";
import { shortName } from "../../names.ts";
import { Btn } from "../../ui/primitives.tsx";
import { RepairOptions } from "../chrome/RepairOptions.tsx";
import { useChrome } from "../chrome/shared.tsx";
import { Cover } from "./Cover.tsx";
import { holidayOn } from "./calc.ts";
import { monthLoads, span } from "./lib.ts";
import { useTimeOffUi } from "./ui.ts";

const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (d: ISODate) => `${WEEK[weekday(d)]}, ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8))}`;
const KIND_TIP = (u: Unavailability) => u.type;

function H({ children }: { children: string }) {
  return <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h4>;
}

export function DayDetail({ locked }: { locked: boolean }) {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const ui = useTimeOffUi();
  const date = ui.day;
  const state = world?.state;
  const load = useMemo(() => (state && date ? monthLoads(state, asOf, date.slice(0, 7)).find((l) => l.date === date) ?? null : null), [state, asOf, date]);
  const open = useMemo(() => {
    if (!state || !date) return [];
    const ev = evaluateCached(state, asOf, { range: { from: date, to: date } });
    return Object.values(ev.cells).filter((c) => c.date === date && c.open > 0).sort((a, b) => (a.storeId < b.storeId ? -1 : 1));
  }, [state, asOf, date]);
  if (!state || !date || !load) return null;

  const name = (id: string) => state.pharmacists[id]?.name ?? id;
  const code = (id: string) => state.stores[id]?.code ?? id;
  const on = Object.values(state.unavailability).filter((u) => !u.scopeStoreId && u.first <= date && date <= u.last);
  const off = on.filter((u) => u.status === "Approved" || u.status === "Actual").sort((a, b) => (name(a.pharmacistId) < name(b.pharmacistId) ? -1 : 1));
  const waiting = on.filter((u) => u.status === "Requested").sort((a, b) => (name(a.pharmacistId) < name(b.pharmacistId) ? -1 : 1));
  const holiday = holidayOn(date);
  const causeOf = (storeId: string) => load.short.find((s) => s.storeId === storeId);
  const findCover = (storeId: string) => { useChrome.getState().setRepairOrigin("out"); void useApp.getState().runRepair([{ storeId, date }]); };
  const step = (n: number) => ui.openDay(addDays(date, n));

  return (
    <section aria-label={`${fmtDate(date)} details`} data-day-detail={date} className="min-w-0">
      <div className="mb-3 flex items-center gap-1">
        <button type="button" onClick={() => ui.openDay(null)} className="mr-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">‹ Month</button>
        <h3 className="mr-auto text-lg font-semibold" tabIndex={-1} id="day-title">{longDay(date)}</h3>
        <button type="button" aria-label="Previous day" onClick={() => step(-1)} className="grid size-8 place-items-center rounded-md text-lg text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">‹</button>
        <button type="button" aria-label="Next day" onClick={() => step(1)} className="grid size-8 place-items-center rounded-md text-lg text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">›</button>
      </div>
      {(holiday || load.closed.length > 0) && (
        <p className="mb-3 text-sm text-muted">{[holiday, load.closed.length ? `Closed: ${load.closed.map(code).join(", ")}` : ""].filter(Boolean).join(" · ")}</p>
      )}

      {open.length > 0 && (
        <div className="mb-4">
          <H>Needs cover</H>
          <ul className="space-y-3" aria-label="Stores that need cover">
            {open.map((c) => {
              const cause = causeOf(c.storeId);
              const who = cause?.offIds.map((id) => shortName(name(id), 22)).join(", ");
              return (
                <li key={c.storeId} data-open-store={c.storeId} className="rounded-lg bg-cream p-3 ring-1 ring-line">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-sm">
                      <b>{code(c.storeId)}</b>{" "}
                      {c.covered === 0 && c.required > 0 ? "has nobody" : `needs ${c.open} more`}
                      {who ? <span className="text-muted"> · {who} {cause!.offIds.length === 1 ? "is" : "are"} off</span> : null}
                    </p>
                    <Btn disabled={locked} aria-label={`Find cover for ${code(c.storeId)}`} onClick={() => findCover(c.storeId)}>Find cover</Btn>
                  </div>
                  <Cover state={state} storeId={c.storeId} date={date} locked={locked} />
                </li>
              );
            })}
          </ul>
          <RepairOptions where="out" />
        </div>
      )}

      <div className="mb-4">
        <H>Off</H>
        {off.length === 0 ? <p className="text-sm text-muted">Nobody.</p> : (
          <ul aria-label="People off" className="divide-y divide-line/70">
            {off.map((u) => (
              <li key={u.id} data-unavail={u.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0"><b className="font-medium">{shortName(name(u.pharmacistId), 28)}</b> <span className="text-muted" title={KIND_TIP(u)}>{u.type} · {span(u)}{u.note ? ` · ${u.note}` : ""}</span></span>
                <Btn tone="ghost" disabled={locked} aria-label={`Remove: ${name(u.pharmacistId)} ${span(u)}`} onClick={() => useApp.getState().commit([{ t: "unavail.remove", id: u.id }], `Time off removed for ${shortName(name(u.pharmacistId), 22)}.`)}>Remove</Btn>
              </li>
            ))}
          </ul>
        )}
      </div>

      {waiting.length > 0 && (
        <div className="mb-4">
          <H>Asked</H>
          <ul aria-label="Waiting for an answer that day" className="text-sm">
            {waiting.map((u) => <li key={u.id} className="py-0.5"><b className="font-medium">{shortName(name(u.pharmacistId), 28)}</b> <span className="text-muted">{u.type} · {span(u)}</span></li>)}
          </ul>
        </div>
      )}

      <Btn onClick={() => ui.openAdd("add", date)}>Add time off for this day</Btn>
    </section>
  );
}
