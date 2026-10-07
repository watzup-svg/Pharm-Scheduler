// Setup > Holidays. The common U.S. holidays for a year, worked out on this computer (nothing is looked up online). One switch per holiday closes
// the stores that are open that day; "Stores" lets one store be closed, reduced or left usual. A closed day is a date change of 0 named after the
// holiday, so it also shows on the Dates tab. Each click is one change set with Undo.
import { useMemo, useState } from "react";
import type { DomainState, ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, GLYPH, cx } from "../../ui/primitives.tsx";
import { TipButton } from "../chrome/Title.tsx";
import { dayLabel, dayStatuses, holidayEdit, holidaySummary, holidayToggle, usHolidays, type DayStatus, type HolidaySetting, type UsHoliday } from "./lib.ts";
import { inputCls, useLocked } from "./shared.tsx";

function statusText(rows: DayStatus[]): { text: string; set: boolean } {
  const s = holidaySummary(rows);
  if (s.total === 0) return { text: "No stores open then", set: false };
  const closedAll = s.closed + s.shut === s.total;
  if (closedAll && s.closed === 0) return { text: "Closed anyway that weekday", set: false };
  if (closedAll) return { text: s.closed === s.total ? "Closed everywhere" : `Closed everywhere (${s.shut} on a day off anyway)`, set: true };
  const parts: string[] = [];
  if (s.closed) parts.push(`Closed at ${s.closed + s.shut} of ${s.total}`);
  if (s.reduced) parts.push(`${s.closed ? "reduced" : "Reduced"} at ${s.reduced}`);
  return parts.length ? { text: parts.join(", "), set: true } : { text: "Usual hours", set: false };
}

export function HolidaysTab() {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const setTab = useApp((s) => s.setSetupTab);
  const locked = useLocked();
  const commit = useApp((s) => s.commit);
  const say = useApp((s) => s.say);
  const [year, setYear] = useState(Number(asOf.slice(0, 4)));
  const [observed, setObserved] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const st = world.state;
  const list = useMemo(() => usHolidays(year), [year]);
  const otherChanges = useMemo(() => {
    const names = new Set<string>(list.map((h) => h.label));
    return Object.values(st.dateOverrides).filter((o) => o.date >= `${year}-01-01` && o.date <= `${year}-12-31` && !names.has(o.note)).length;
  }, [st.dateOverrides, list, year]);

  const dateOf = (h: UsHoliday): ISODate => (observed && h.observed ? h.observed : h.date);

  const toggle = (h: UsHoliday) => {
    const date = dateOf(h);
    const t = holidayToggle(st, date, h.label);
    if (t.edits.length === 0) { say("info", "Nothing to change: every store is already closed that day."); return; }
    commit(t.edits, t.action === "close" ? `Closed ${t.stores.length} ${t.stores.length === 1 ? "store" : "stores"} for ${h.label}, ${dayLabel(date)}.` : `Opened ${t.stores.length} ${t.stores.length === 1 ? "store" : "stores"} again on ${h.label}, ${dayLabel(date)}.`);
  };

  const setStore = (h: UsHoliday, storeId: string, setting: HolidaySetting) => {
    const date = dateOf(h);
    const e = holidayEdit(st, storeId, date, h.label, setting);
    if (!e) return;
    const code = st.stores[storeId]?.code ?? storeId;
    const what = setting.t === "close" ? "closed" : setting.t === "usual" ? "back to its usual need" : `needing ${setting.n}`;
    commit([e], `Set ${code} on ${h.label}, ${dayLabel(date)}, to ${what}.`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Year" className="flex items-center gap-1">
          <Btn tone="ghost" className="w-8 px-0" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>‹</Btn>
          <span className="min-w-14 text-center text-lg font-semibold tabular-nums" data-testid="holiday-year">{year}</span>
          <Btn tone="ghost" className="w-8 px-0" aria-label="Next year" onClick={() => setYear((y) => y + 1)}>›</Btn>
        </div>
        <label className="flex h-8 items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={observed} onChange={(e) => setObserved(e.target.checked)} /> On a weekend, use the weekday it is observed</label>
        <span className="flex-1" />
        <TipButton title="Holidays" tip="Worked out on this computer; nothing is looked up online. | Which holidays your stores close for is up to you. | Closing a store sets that date's need to 0, named after the holiday. It also shows on the Dates tab. | Every click can be undone." />
      </div>

      <ul aria-label={`Holidays in ${year}`} className="divide-y divide-line/60 rounded-md bg-white ring-1 ring-line">
        {list.map((h) => {
          const date = dateOf(h);
          const rows = dayStatuses(st, date);
          const { text, set } = statusText(rows);
          const past = date < asOf;
          const expanded = openKey === h.key;
          const todo = holidayToggle(st, date, h.label);
          const on = rows.length > 0 && holidaySummary(rows).closed + holidaySummary(rows).shut === rows.length;
          return (
            <li key={h.key} data-holiday={h.key} data-date={date} className={cx(past && "opacity-60")}>
              <div className="grid grid-cols-[8rem_minmax(0,1fr)_minmax(10rem,14rem)_auto_auto] items-center gap-x-4 px-3 py-2.5">
                <span className="text-sm tabular-nums" data-tip={h.observed ? `${dayLabel(h.date)} | Falls on a weekend | Observed ${dayLabel(h.observed)}` : undefined}>{dayLabel(date)}</span>
                <span className="min-w-0">
                  <span className="font-semibold">{h.label}</span>
                  {h.observed && <span className="ml-2 text-xs text-muted">{observed ? `on ${dayLabel(h.date)}` : `observed ${dayLabel(h.observed)}`}</span>}
                </span>
                <span className={cx("text-sm", set ? "font-semibold text-ok" : "text-muted")} data-holiday-status>{set && <span aria-hidden>{GLYPH.ok} </span>}{text}</span>
                <button type="button" role="switch" aria-checked={on} aria-label={`Close the stores on ${h.label}`} disabled={!!locked || past || (todo.edits.length === 0)}
                  data-tip={past ? "Past date | Use the Dates tab to change a day that has gone by" : on ? `Open the stores again | Only the ones this holiday closed` : "Close the stores | Every store that is open that day"}
                  onClick={() => toggle(h)}
                  className="relative h-6 w-11 shrink-0 rounded-full bg-black/20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 aria-checked:bg-ok">
                  <span aria-hidden className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
                </button>
                <Btn tone="ghost" aria-expanded={expanded} aria-label={`Choose stores for ${h.label}`} onClick={() => setOpenKey(expanded ? null : h.key)}>Stores</Btn>
              </div>
              {expanded && <StoreChoices rows={rows} st={st} locked={!!locked || past} onSet={(id, s) => setStore(h, id, s)} />}
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted">
        {otherChanges > 0 ? `${otherChanges} other date ${otherChanges === 1 ? "change" : "changes"} in ${year}. ` : ""}
        <button type="button" onClick={() => setTab("dates")} className="font-semibold text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ink">Other dates and clinics</button>
      </p>
    </div>
  );
}

function StoreChoices({ rows, st, locked, onSet }: { rows: DayStatus[]; st: DomainState; locked: boolean; onSet: (storeId: string, s: HolidaySetting) => void }) {
  return (
    <ul aria-label="Stores on this day" className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-line/60 bg-paper px-3 py-3 lg:grid-cols-3 xl:grid-cols-4">
      {rows.length === 0 && <li className="text-sm text-muted">No store is open that day.</li>}
      {rows.map((r) => {
        const s = st.stores[r.storeId]!;
        const value = r.kind === "closed" ? "closed" : r.kind === "reduced" ? String(r.count) : "usual";
        const counts = [...new Set([1, 2, 3, ...(r.kind === "reduced" ? [r.count] : [])])].sort((a, b) => a - b);
        return (
          <li key={r.storeId} className="flex items-center justify-between gap-2" data-store-choice={s.code}>
            <span className="min-w-0 truncate text-sm" title={s.name}><strong>{s.code}</strong></span>
            {r.kind === "shut" ? <span className="text-xs text-muted">Closed that weekday</span> : (
              <select aria-label={`${s.code} on this holiday`} disabled={locked} value={value} className={cx(inputCls, "h-7 w-32 pr-5 text-sm")}
                onChange={(e) => { const v = e.target.value; onSet(r.storeId, v === "usual" ? { t: "usual" } : v === "closed" ? { t: "close" } : { t: "need", n: Number(v) }); }}>
                <option value="usual">Usual need ({r.usual})</option>
                <option value="closed">Closed</option>
                {counts.map((n) => <option key={n} value={String(n)}>Needs {n}</option>)}
              </select>
            )}
          </li>
        );
      })}
    </ul>
  );
}
