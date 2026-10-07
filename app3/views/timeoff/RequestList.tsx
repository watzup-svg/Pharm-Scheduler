// The left list on the Time off screen: Waiting (soonest first, with what approving would do), Approved and Declined. A row colours like the sheet
// (yellow = waiting, rose = approved but the person is still scheduled). Clicking a row selects that person's first day on the sheet.
import { useMemo, useState } from "react";
import { applyScratch, type DomainState, type ISODate, type Unavailability } from "@domain";
import { useApp } from "../../store.ts";
import { shortName } from "../../names.ts";
import { cx } from "../../ui/primitives.tsx";
import { BlockMark, type MarkKind } from "../../ui/icons.tsx";
import { windowFor } from "../wall/model.ts";
import { callers, consequenceText, safeToApprove, type Cell } from "./calc.ts";
import { opensIfApprovedAll, span } from "./lib.ts";
import { kindOf, isTimeOff, typeWord } from "./sheet.ts";
import { useTimeOffUi, type Tab } from "./ui.ts";

const TABS: [Tab, string][] = [["waiting", "Waiting"], ["approved", "Approved"], ["declined", "Declined"]];
const byDate = (a: Unavailability, b: Unavailability) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.id < b.id ? -1 : 1);

/** The records the list shows: from today on, and not the "turned down this store" notes (those are not time off). */
export function listable(state: DomainState, asOf: ISODate): Unavailability[] {
  return Object.values(state.unavailability).filter((u) => u.last >= asOf && isTimeOff(u)).sort(byDate);
}
export const tabOf = (u: Unavailability): Tab => kindOf(u);

/** "Approving leaves WOO short on Oct 20", in words, with how many people could cover the first cell. */
export function Consequence({ state, u, cells }: { state: DomainState; u: Unavailability; cells: Cell[] }) {
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

/** Select a request on the sheet: its first day (or today, if it began earlier), moving the window when that day is off screen. */
export function goToRecord(u: Unavailability) {
  const st = useApp.getState();
  const date = u.first < st.asOf && u.last >= st.asOf ? st.asOf : u.first;
  if (date < st.window.from || date > st.window.to) { const w = windowFor("month", date); st.setWindow(w.from, w.to); }
  st.select({ pharmacistId: u.pharmacistId, date });
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[role="gridcell"][data-pid="${u.pharmacistId}"][data-date="${date}"]`)?.scrollIntoView({ block: "nearest", inline: "center" }));
}

export function RequestList() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const sel = useApp((s) => s.selection);
  const ui = useTimeOffUi();
  const state = world?.state;
  const all = useMemo(() => (state ? listable(state, asOf) : []), [state, asOf]);
  const waiting = useMemo(() => all.filter((u) => tabOf(u) === "waiting"), [all]);
  const opens = useMemo(() => (state ? opensIfApprovedAll(state, waiting, asOf) : new Map<string, Cell[]>()), [state, waiting, asOf]);
  const safe = useMemo(() => (state ? safeToApprove(state, waiting, asOf) : []), [state, waiting, asOf]);
  // The remembered tab, or Waiting when anything waits. Fixed when the list opens, so approving the last request does not flip the list under you.
  const [initial] = useState<Tab>(() => (waiting.length ? "waiting" : "approved"));
  const tab: Tab = ui.tab ?? initial;
  const locked = !!world?.session.proposal || (!!world?.session.scenario && !world.session.scenario.parked);
  if (!world || !state) return null;

  const rows = all.filter((u) => tabOf(u) === tab);
  const who = (u: Unavailability) => state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId;
  const approveSafe = () => useApp.getState().commit(safe.map((id) => ({ t: "unavail.update" as const, id, patch: { status: "Approved" as const } })), `Approved ${safe.length} requests that leave every store covered.`);
  // Approved days where the person is still scheduled leave a store short: those rows go rose.
  const stillWorking = (u: Unavailability) => tab === "approved" && Object.values(state.assignments).some((a) => a.pharmacistId === u.pharmacistId && a.date >= u.first && a.date <= u.last);
  const empty = tab === "waiting" ? "Nothing is waiting for an answer." : tab === "approved" ? "No approved time off from today on." : "Nothing declined.";

  return (
    <div className="px-3 py-2.5" data-request-list>
      <div role="group" aria-label="Show" className="flex gap-1">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => ui.setTab(t)}
            className={cx("rounded-md px-2.5 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", tab === t ? "bg-ink text-white" : "text-muted hover:bg-fill")}>
            {label}{t === "waiting" && waiting.length ? ` ${waiting.length}` : ""}
          </button>
        ))}
      </div>
      {tab === "waiting" && safe.length > 1 && (
        <button type="button" disabled={locked} onClick={approveSafe} data-tip={`Approve ${safe.length} | They leave every store covered, together | One change; Undo puts them all back`}
          className="mt-2 rounded-md px-1 py-0.5 text-left text-sm font-semibold underline underline-offset-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ink">
          Approve the {safe.length} that leave every store covered
        </button>
      )}
      {rows.length === 0 ? <p className="mt-3 text-sm">{empty}</p> : (
        <ul className="mt-2 space-y-1" aria-label={tab === "waiting" ? "Waiting for an answer" : tab === "approved" ? "Approved time off" : "Declined time off"}>
          {rows.map((u) => {
            const on = sel?.pharmacistId === u.pharmacistId && !sel.storeId && sel.date >= u.first && sel.date <= u.last;
            const cells = tab === "waiting" ? opens.get(u.id) ?? [] : [];
            const sev = tab === "waiting" ? "warn" : stillWorking(u) ? "bad" : undefined;
            const mark: MarkKind = tab === "waiting" ? "waiting" : tab === "declined" ? "declined" : u.type === "Sick" ? "sick" : "away";
            return (
              <li key={u.id} data-unavail={u.id}>
                <button type="button" onClick={() => goToRecord(u)} aria-current={on ? "true" : undefined} data-sev={sev} title={`${who(u)}, ${span(u)}`}
                  className={cx("q-row flex w-full items-start gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-ink", on && "q-on")}>
                  <BlockMark kind={mark} tone={sev ?? "quiet"} size={24} className="mt-px" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{shortName(who(u), 24)}</span>
                    <span className="block text-ink/80">{span(u)} · {typeWord(u)}</span>
                    {tab === "waiting" && <span data-consequence className="block text-xs text-ink/70">{cells.length ? `Approving leaves ${cells.length === 1 ? "1 store day" : `${cells.length} store days`} short` : "Approving leaves every store covered"}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
