// The list beside the month: Waiting (soonest first, with what approving would do, written out), Approved and Declined. The last tab chosen is remembered.
import { useMemo, useState } from "react";
import { applyScratch, type DomainState, type ISODate, type Unavailability } from "@domain";
import { useApp } from "../../store.ts";
import { shortName } from "../../names.ts";
import { Btn, cx } from "../../ui/primitives.tsx";
import { callers, consequenceText, safeToApprove, type Cell } from "./calc.ts";
import { opensIfApprovedAll, span } from "./lib.ts";
import { useTimeOffUi, type Tab } from "./ui.ts";

const TABS: [Tab, string][] = [["waiting", "Waiting"], ["approved", "Approved"], ["declined", "Declined"]];
const byDate = (a: Unavailability, b: Unavailability) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.id < b.id ? -1 : 1);

/** The records the page lists: from today on, and not the "turned down this store" notes (those are not time off). */
export function listable(state: DomainState, asOf: ISODate): Unavailability[] {
  return Object.values(state.unavailability).filter((u) => u.last >= asOf && u.type !== "Turned-down").sort(byDate);
}
export const tabOf = (u: Unavailability): Tab => (u.status === "Requested" ? "waiting" : u.status === "Denied" ? "declined" : "approved");

function Consequence({ state, u, cells }: { state: DomainState; u: Unavailability; cells: Cell[] }) {
  const asOf = useApp((s) => s.asOf);
  const covers = useMemo(() => {
    const first = cells[0];
    if (!first) return 0;
    const after = applyScratch(state, [{ t: "unavail.update", id: u.id, patch: { status: "Approved" } }]);
    return "refused" in after ? 0 : callers(after, first.storeId, first.date, asOf).length;
  }, [state, u.id, cells, asOf]);
  const text = consequenceText((id) => state.stores[id]?.code ?? id, cells, covers);
  const tone = !cells.length ? "text-ok" : covers === 0 ? "text-illegal" : "text-warn";
  return <p data-consequence className={cx("mt-1 text-sm", tone)}><span aria-hidden>{!cells.length ? "✓" : "▲"}</span> {text}</p>;
}

export function Requests({ locked }: { locked: boolean }) {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const ui = useTimeOffUi();
  const state = world?.state;
  const all = useMemo(() => (state ? listable(state, asOf) : []), [state, asOf]);
  const waiting = useMemo(() => all.filter((u) => tabOf(u) === "waiting"), [all]);
  const opens = useMemo(() => (state ? opensIfApprovedAll(state, waiting, asOf) : new Map<string, Cell[]>()), [state, waiting, asOf]);
  const safe = useMemo(() => (state ? safeToApprove(state, waiting, asOf) : []), [state, waiting, asOf]);
  // The remembered tab, or Waiting when anything waits. Fixed when the page opens, so approving the last request does not flip the list under you.
  const [tab, setTabState] = useState<Tab>(() => ui.tab ?? (waiting.length ? "waiting" : "approved"));
  const setTab = (t: Tab) => { setTabState(t); ui.setTab(t); };
  if (!world || !state) return null;

  const rows = tab === "waiting" ? waiting : all.filter((u) => tabOf(u) === tab);
  const who = (u: Unavailability) => state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId;
  const say = (u: Unavailability) => `${shortName(who(u), 22)}, ${span(u)}`;
  const decide = (u: Unavailability, status: "Approved" | "Denied") => useApp.getState().commit([{ t: "unavail.update", id: u.id, patch: { status } }], `${status === "Approved" ? "Approved" : "Declined"} time off for ${say(u)}.`);
  const remove = (u: Unavailability) => useApp.getState().commit([{ t: "unavail.remove", id: u.id }], `Time off removed for ${say(u)}.`);
  const approveSafe = () => useApp.getState().commit(safe.map((id) => ({ t: "unavail.update" as const, id, patch: { status: "Approved" as const } })), `Approved ${safe.length} requests that leave every store covered.`);

  const light = (u: Unavailability | null) => ui.setLit(u ? { first: u.first, last: u.last } : null);
  const row = (u: Unavailability) => {
    const label = `${who(u)} ${span(u)}`;
    return (
      <li key={u.id} data-unavail={u.id} onMouseEnter={() => light(u)} onMouseLeave={() => light(null)} onFocus={() => light(u)} onBlur={() => light(null)}
        className="flex items-start justify-between gap-3 rounded-xl bg-cream px-4 py-3 ring-1 ring-line">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2"><b className="truncate font-semibold" title={who(u)}>{shortName(who(u), 26)}</b><span className="shrink-0 text-sm tabular-nums text-muted">{span(u)}</span></p>
          <p className="truncate text-sm text-muted">{u.type}{u.note ? ` · ${u.note}` : ""}</p>
          {tab === "waiting" && <Consequence state={state} u={u} cells={opens.get(u.id) ?? []} />}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {tab === "waiting" ? (
            <>
              <Btn tone="ink" aria-label={`Approve: ${label}`} onClick={() => decide(u, "Approved")} disabled={locked}>Approve</Btn>
              <Btn aria-label={`Decline: ${label}`} onClick={() => decide(u, "Denied")} disabled={locked}>Decline</Btn>
            </>
          ) : (
            <>
              {tab === "declined" && <Btn aria-label={`Approve: ${label}`} onClick={() => decide(u, "Approved")} disabled={locked}>Approve</Btn>}
              <Btn tone="ghost" aria-label={`Remove: ${label}`} onClick={() => remove(u)} disabled={locked}>Remove</Btn>
            </>
          )}
        </div>
      </li>
    );
  };

  const empty = tab === "waiting" ? "Nothing is waiting for an answer." : tab === "approved" ? "No approved time off from today on." : "Nothing declined.";
  return (
    <section aria-label="Requests" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div role="group" aria-label="Show" className="flex gap-1">
          {TABS.map(([t, label]) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}
              className={cx("rounded-md px-3 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", tab === t ? "bg-ink text-white" : "text-muted hover:bg-fill")}>
              {label}
            </button>
          ))}
        </div>
        {tab === "waiting" && safe.length > 1 && (
          <button type="button" disabled={locked} onClick={approveSafe} data-tip={`Approve ${safe.length} | They leave every store covered, together | One change; Undo puts them all back`} className="rounded-md px-2 py-1 text-sm text-muted underline hover:bg-fill disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ink">
            Approve the {safe.length} that leave every store covered
          </button>
        )}
      </div>
      {rows.length === 0 ? <p className="py-6 text-sm text-muted">{empty}</p> : (
        <ul className="space-y-2" aria-label={tab === "waiting" ? "Waiting for an answer" : tab === "approved" ? "Approved time off" : "Declined time off"}>{rows.map(row)}</ul>
      )}
    </section>
  );
}
