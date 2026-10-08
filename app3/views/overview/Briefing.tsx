// The morning briefing's three questions beyond the problem list: what is waiting on a decision (time off, with what approving would do),
// what changed since the schedule was posted, and what the next two weeks look like. Read and jump; nothing here writes.
import { useMemo } from "react";
import { addDays, api, type ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { evaluateCached } from "../../derive.ts";
import { fmtDate, fmtRange } from "../../copy.ts";
import { shortName } from "../../names.ts";
import { Btn } from "../../ui/primitives.tsx";
import { dayLoads, troubleDay } from "../timeoff/calc.ts";
import { opensIfApprovedAll } from "../timeoff/lib.ts";
import { Consequence, goToRecord, listable, tabOf } from "../timeoff/RequestList.tsx";
import { openTimeOff } from "./actions.ts";

const H = "text-xs font-semibold uppercase tracking-wide text-muted";

/** Requests waiting for an answer, soonest first, each with what approving would do. */
export function WaitingRequests() {
  const state = useApp((s) => s.world?.state);
  const asOf = useApp((s) => s.asOf);
  const waiting = useMemo(() => (state ? listable(state, asOf).filter((u) => tabOf(u) === "waiting") : []), [state, asOf]);
  const shown = waiting.slice(0, 3);
  const opens = useMemo(() => (state ? opensIfApprovedAll(state, shown, asOf) : new Map()), [state, shown, asOf]);
  if (!state || !shown.length) return null;
  return (
    <div className="mt-4" data-waiting>
      <h3 className={H}>Time off waiting for an answer</h3>
      <ul className="mt-1 divide-y divide-line/60">
        {shown.map((u) => (
          <li key={u.id} className="py-2" data-request={u.id}>
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-sm"><span className="font-semibold">{shortName(state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId, 24)}</span><span className="text-muted"> · {fmtRange(u.first, u.last)}</span></p>
              <Btn aria-label={`Review the request from ${state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId}`} onClick={() => { openTimeOff(); goToRecord(u); }}>Review</Btn>
            </div>
            <Consequence state={state} u={u} cells={opens.get(u.id) ?? []} />
          </li>
        ))}
      </ul>
      {waiting.length > shown.length && <button type="button" onClick={openTimeOff} className="mt-1 rounded px-1.5 text-sm text-muted underline underline-offset-2 hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">See all {waiting.length} waiting</button>}
    </div>
  );
}

/** What differs from the last posted schedule: a count and the first few changes. */
export function Changed() {
  const world = useApp((s) => s.world);
  const list = useMemo(() => (world ? api.changedSincePosting(world) : []), [world]);
  if (!world) return null;
  const posted = world.journal.snapshots.length > 0;
  const code = (id: string) => (id === "off" ? "off" : world.state.stores[id]?.code ?? id);
  const go = () => useApp.getState().setView("print");
  return (
    <section aria-labelledby="ov-changed" data-changed className="rounded-xl p-4 ring-1 ring-inset ring-line">
      <h2 id="ov-changed" className={H}>Since you posted</h2>
      {!posted ? (
        <p className="mt-2 text-sm text-muted">Nothing posted yet. Posting keeps a copy, so you can see what changes after people have seen it.</p>
      ) : list.length === 0 ? (
        <p className="mt-2 text-sm text-ok"><span aria-hidden>✓</span> Nothing has changed since the last posting.</p>
      ) : (
        <>
          <p className="mt-2 text-sm font-semibold">{list.length} {list.length === 1 ? "change" : "changes"} people may not know about</p>
          <ul className="mt-1 text-sm text-ink/80">
            {list.slice(0, 3).map((c) => <li key={`${c.pharmacistId}|${c.date}`}>{shortName(world.state.pharmacists[c.pharmacistId]?.name ?? c.pharmacistId, 22)}, {fmtDate(c.date)}: {code(c.posted)} → {code(c.now)}</li>)}
          </ul>
          <button type="button" onClick={go} className="mt-2 rounded px-1.5 text-sm font-medium underline underline-offset-2 hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">Open Print{list.length > 3 ? ` to see all ${list.length}` : ""}</button>
        </>
      )}
    </section>
  );
}

/** The next fourteen days: how many shifts are still open, and the day most likely to go wrong. */
export function ComingUp() {
  const state = useApp((s) => s.world?.state);
  const asOf = useApp((s) => s.asOf);
  const facts = useMemo(() => {
    if (!state) return null;
    const to: ISODate = addDays(asOf, 13);
    const ev = evaluateCached(state, asOf, { range: { from: asOf, to } });
    let open = 0;
    const days = new Set<string>();
    for (const c of Object.values(ev.cells)) if (c.date >= asOf && c.date <= to && c.open > 0) { open += c.open; days.add(c.date); }
    const risk = troubleDay(dayLoads(state, ev, asOf, to));
    return { open, days: days.size, risk, to };
  }, [state, asOf]);
  if (!facts) return null;
  const { open, days, risk } = facts;
  return (
    <section aria-labelledby="ov-coming" data-coming-up className="rounded-xl p-4 ring-1 ring-inset ring-line">
      <h2 id="ov-coming" className={H}>Next two weeks</h2>
      <p className="mt-2 text-sm font-semibold">{open === 0 ? "Every shift is covered." : `${open} open ${open === 1 ? "shift" : "shifts"} on ${days} ${days === 1 ? "day" : "days"}`}</p>
      {risk ? (
        <p className="text-sm text-ink/80">Most likely to go wrong: {fmtDate(risk.date)}{risk.holiday ? ` (${risk.holiday})` : ""}, {risk.off.length ? `${risk.off.length} off` : "stores short"}{risk.waiting.length ? `, ${risk.waiting.length} waiting on an answer` : ""}.</p>
      ) : (
        <p className="text-sm text-muted">No day stands out as a risk.</p>
      )}
    </section>
  );
}
