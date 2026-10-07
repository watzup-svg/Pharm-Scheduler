// The right column on the Time off screen: one person on one day. What time off they have then (decide it right here), what it does to the
// stores (who could cover each, ranked), and a way to add more.
import { useMemo } from "react";
import type { Unavailability } from "@domain";
import { useApp } from "../../store.ts";
import { fmtDate } from "../../copy.ts";
import { shortName } from "../../names.ts";
import { Btn, Section } from "../../ui/primitives.tsx";
import { RepairOptions } from "../chrome/RepairOptions.tsx";
import { useChrome } from "../chrome/shared.tsx";
import { PersonDisc } from "../../ui/PersonDisc.tsx";
import { AddForm } from "./AddForm.tsx";
import { Cover } from "./Cover.tsx";
import { opensIfApprovedAll, monthLoads, span, useWhyLocked } from "./lib.ts";
import { Consequence } from "./RequestList.tsx";
import { indexRecords, kindOf, recordsOn, typeWord } from "./sheet.ts";
import { useTimeOffUi } from "./ui.ts";
import { HomeCode } from "../../ui/HomeCode.tsx";

export function DayInspector() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const sel = useApp((s) => s.selection);
  const why = useWhyLocked();
  const adding = useTimeOffUi((s) => s.add !== null);
  const addKey = useTimeOffUi((s) => `${s.addPid}|${s.addDate}|${s.addLast}`);
  const state = world?.state;
  const pid = sel && !sel.storeId ? sel.pharmacistId : undefined;
  const date = sel?.date;
  const p = state && pid ? state.pharmacists[pid] : undefined;
  const recs = useMemo(() => (state && pid && date ? recordsOn(indexRecords(state).get(pid), date) : []), [state, pid, date]);
  const short = useMemo(() => (state && pid && date ? monthLoads(state, asOf, date.slice(0, 7)).find((l) => l.date === date)?.short.filter((s) => s.offIds.includes(pid)) ?? [] : []), [state, asOf, pid, date]);
  const form = adding ? (
    <section aria-label="Add time off" data-add-form className="border-b border-line bg-paper px-3 py-3">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Add time off</h2>
        <button type="button" onClick={() => useTimeOffUi.getState().openAdd(null)} className="text-xs text-muted underline focus-visible:outline-2 focus-visible:outline-ink" aria-label="Close the form">Close</button></div>
      <AddForm key={addKey} onDone={() => useTimeOffUi.getState().openAdd(null)} />
    </section>
  ) : null;
  if (!state || !p || !pid || !date) return <>{form}{!form && <p className="p-3 text-sm text-muted">Drag across a person's days on the sheet to add time off, or click a day or a request on the list to see details here.</p>}</>;

  const locked = !!why;
  const code = (id: string) => state.stores[id]?.code ?? id;
  const name = shortName(p.name, 22);
  const decide = (u: Unavailability, status: "Approved" | "Denied") => useApp.getState().commit([{ t: "unavail.update", id: u.id, patch: { status } }], `${status === "Approved" ? "Approved" : "Declined"} time off for ${name}, ${span(u)}.`);
  const remove = (u: Unavailability) => useApp.getState().commit([{ t: "unavail.remove", id: u.id }], `Time off removed for ${name}, ${span(u)}.`);
  const findCover = (storeId: string) => { useChrome.getState().setRepairOrigin("out"); void useApp.getState().runRepair([{ storeId, date }]); };
  const opens = opensIfApprovedAll(state, recs.filter((u) => kindOf(u) === "waiting"), asOf);
  const working = Object.values(state.assignments).filter((a) => a.pharmacistId === pid && a.date === date).map((a) => code(a.storeId));

  return (
    <div data-day-inspector={`${pid}|${date}`}>
      {form}
      <header className="border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-2">
          <PersonDisc id={p.id} size={22} /><h2 className="min-w-0 flex-1 truncate text-base font-semibold" title={p.name}>{p.name}<HomeCode pharmacistId={p.id} /></h2>
          <button type="button" onClick={() => useApp.getState().select(null)} className="shrink-0 rounded-md px-1.5 text-xs text-muted underline focus-visible:outline-2 focus-visible:outline-ink" aria-label="Clear the selection">Clear</button>
        </div>
        <p className="mt-1 text-sm text-muted">{fmtDate(date)}{date < asOf ? " (past)" : ""}</p>
        {recs.length === 0 && <p className="text-sm font-semibold" data-testid="cell-status">{working.length ? `Working at ${working.join(", ")}` : "Not off, not scheduled"}</p>}
      </header>
      {why && <p role="status" className="border-b border-line bg-warn-bg/60 px-3 py-1.5 text-sm" data-testid="inspector-lock">▲ {why}</p>}

      {recs.length > 0 && (
        <Section title="Time off">
          <ul className="flex flex-col gap-2">
            {recs.map((u) => {
              const k = kindOf(u);
              const label = `${p.name} ${span(u)}`;
              return (
                <li key={u.id} data-unavail={u.id} className="rounded-md bg-white p-2 ring-1 ring-line">
                  <p className="text-sm"><b>{typeWord(u)}</b> · {span(u)}</p>
                  <p className="text-xs text-muted">{k === "waiting" ? "Waiting for your answer" : k === "declined" ? "Declined" : "Approved"}{u.note ? ` · ${u.note}` : ""}</p>
                  {k === "waiting" && <Consequence state={state} u={u} cells={opens.get(u.id) ?? []} />}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {k === "waiting" && <><Btn tone="ink" aria-label={`Approve: ${label}`} disabled={locked} onClick={() => decide(u, "Approved")}>Approve</Btn><Btn aria-label={`Decline: ${label}`} disabled={locked} onClick={() => decide(u, "Denied")}>Decline</Btn></>}
                    {k === "declined" && <Btn aria-label={`Approve: ${label}`} disabled={locked} onClick={() => decide(u, "Approved")}>Approve</Btn>}
                    {k !== "waiting" && <Btn tone="ghost" aria-label={`Remove: ${label}`} disabled={locked} onClick={() => remove(u)}>Remove</Btn>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {short.length > 0 && (
        <Section title="Stores left short">
          <ul className="flex flex-col gap-3" aria-label="Stores that need cover">
            {short.map((c) => (
              <li key={c.storeId} data-open-store={c.storeId} className="rounded-lg bg-white p-2 ring-1 ring-line">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm"><b>{code(c.storeId)}</b> {c.empty ? "has nobody" : `needs ${c.open} more`}</p>
                  <Btn disabled={locked} aria-label={`Find cover for ${code(c.storeId)}`} onClick={() => findCover(c.storeId)}>Find cover</Btn>
                </div>
                <Cover state={state} storeId={c.storeId} date={date} exclude={[pid]} locked={locked} />
              </li>
            ))}
          </ul>
          <RepairOptions where="out" />
        </Section>
      )}

      {!adding && <div className="flex flex-wrap gap-1.5 px-3 py-3">
        <Btn onClick={() => useTimeOffUi.getState().openAdd("add", date, pid)} disabled={locked}>Add time off for {shortName(p.name, 18)}</Btn>
      </div>}
    </div>
  );
}
