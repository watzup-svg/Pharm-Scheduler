// The month, one thin line per store: a tick for each day. Green covered, pink needs cover, red a rule is broken, short grey closed.
// Shape carries the meaning as well as colour (a cap on the open ones, a dot on the red ones, a stub for closed). Click a store to open it
// on the wall, a day to open that day. One tab stop; arrow keys move between ticks.
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { RULE_BY_ID, dateRange, type DomainState, type Evaluation, type ISODate } from "@domain";
import { cx } from "../../ui/primitives.tsx";
import { fmtDate } from "../../copy.ts";
import { showOnWall } from "./actions.ts";
import { TICK_WORD, monthBounds, tickState, type TickState } from "./lib.ts";

export type ThinRow = { storeId: string; code: string; name: string; states: TickState[]; notes: string[] };

/** One row per store active in the month; a state for each day. Pure over the state and its evaluation. */
export function buildThinRows(state: DomainState, ev: Evaluation, dates: ISODate[]): ThinRow[] {
  const first = dates[0]!, last = dates[dates.length - 1]!;
  const breaks = new Set<string>();
  const placed = new Set<string>();
  for (const a of Object.values(state.assignments)) {
    if (a.date < first || a.date > last) continue;
    const k = `${a.storeId}|${a.date}`;
    placed.add(k);
    const e = ev.assignments[a.id];
    if (e?.results.some((r) => r.verdict === "Fail" && !r.overridden && RULE_BY_ID[r.ruleId]?.kind === "presence")) breaks.add(k);
  }
  return Object.values(state.stores)
    .filter((s) => (!s.activeFrom || s.activeFrom <= last) && (!s.inactiveFrom || s.inactiveFrom > first))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : 1))
    .map((s) => {
      const notes: string[] = [];
      const states = dates.map((d) => {
        const k = `${s.id}|${d}`;
        const c = ev.cells[k];
        notes.push(c && c.open > 0 ? `Needs ${c.open} more` : "");
        return tickState(c ? { required: c.required, open: c.open, hasAssignments: placed.has(k), breaks: breaks.has(k) } : { required: 0, open: 0, hasAssignments: placed.has(k), breaks: breaks.has(k) });
      });
      return { storeId: s.id, code: s.code, name: s.name, states, notes };
    });
}

const TICK: Record<TickState, string> = {
  ok: "h-4 bg-ok-lite",
  open: "h-4 border-t-[4px] border-illegal bg-illegal-bg",
  break: "h-4 bg-illegal",
  closed: "h-1.5 bg-shut",
};
function Tick({ state, past }: { state: TickState; past: boolean }) {
  return (
    <span aria-hidden className={cx("grid w-2.5 place-items-center rounded-[3px]", TICK[state], past && "opacity-50")}>
      {state === "break" && <span className="size-1 rounded-full bg-white" />}
    </span>
  );
}

export function ThinMonth({ state, ev, ym, asOf }: { state: DomainState; ev: Evaluation; ym: string; asOf: ISODate }) {
  const dates = useMemo(() => { const b = monthBounds(ym); return dateRange(b.from, b.to); }, [ym]);
  const rows = useMemo(() => buildThinRows(state, ev, dates), [state, ev, dates]);
  const [at, setAt] = useState<[number, number]>([0, 0]);
  const root = useRef<HTMLDivElement>(null);
  const n = dates.length;
  const todayIdx = dates.indexOf(asOf);
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  const move = (e: KeyboardEvent, r: number, c: number) => {
    let nr = r, nc = c;
    if (e.key === "ArrowRight") nc = Math.min(n, c + 1);
    else if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
    else if (e.key === "ArrowDown") nr = Math.min(rows.length - 1, r + 1);
    else if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
    else if (e.key === "Home") nc = 0;
    else if (e.key === "End") nc = n;
    else return;
    e.preventDefault();
    setAt([nr, nc]);
    root.current?.querySelector<HTMLElement>(`[data-rc="${nr},${nc}"]`)?.focus();
  };

  if (!rows.length) return null;
  return (
    <div ref={root} role="group" aria-label={`Each store's month, one tick per day. Arrow keys move; Enter opens the day on the wall.`} className="relative" data-thin-month>
      <div className="flex items-end">
        <span className="w-14 shrink-0" />
        <div className="grid flex-1 text-center text-xs tabular-nums text-muted" style={cols} aria-hidden>
          {dates.map((d, i) => <span key={d} className={cx("leading-5", i === todayIdx && "font-bold text-ink")}>{[0, 7, 14, 21, 28].includes(i) || i === todayIdx ? i + 1 : ""}</span>)}
        </div>
      </div>
      <div className="relative">
        {todayIdx >= 0 && (
          <span aria-hidden data-today-line className="pointer-events-none absolute inset-y-0 z-0 w-px bg-ink/40" style={{ left: `calc(3.5rem + (100% - 3.5rem) * ${(todayIdx + 0.5) / n})` }} />
        )}
        {rows.map((row, r) => (
          <div key={row.storeId} className="flex items-center" data-store-row={row.code}>
            <button
              type="button" data-rc={`${r},0`} tabIndex={at[0] === r && at[1] === 0 ? 0 : -1}
              onFocus={() => setAt([r, 0])} onKeyDown={(e) => move(e, r, 0)}
              onClick={() => showOnWall(row.storeId, todayIdx >= 0 ? asOf : dates[0]!)}
              aria-label={`${row.code} ${row.name}: open this store on the wall`}
              data-tip={`${row.code} · ${row.name} | ${row.states.filter((s) => s === "open").length} days need cover, ${row.states.filter((s) => s === "break").length} with a broken rule | Open this store on the wall`}
              className="relative z-10 h-6 w-14 shrink-0 rounded text-left text-sm font-semibold hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">{row.code}</button>
            <div className="grid flex-1" style={cols}>
              {dates.map((d, i) => {
                const st = row.states[i]!;
                const word = TICK_WORD[st];
                return (
                  <button
                    key={d} type="button" data-rc={`${r},${i + 1}`} data-state={st} data-date={d} tabIndex={at[0] === r && at[1] === i + 1 ? 0 : -1}
                    onFocus={() => setAt([r, i + 1])} onKeyDown={(e) => move(e, r, i + 1)}
                    onClick={() => showOnWall(row.storeId, d)}
                    aria-label={`${row.code}, ${fmtDate(d)}: ${word}${row.notes[i] ? `, ${row.notes[i]!.toLowerCase()}` : ""}`}
                    data-tip={`${row.code} · ${fmtDate(d)} | ${row.notes[i] || word.replace(/^./, (c) => c.toUpperCase())} | Open this day`}
                    data-tip-tone={st === "open" || st === "break" ? "bad" : st === "ok" ? "ok" : undefined}
                    className="relative z-10 grid h-6 place-items-center rounded-sm hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">
                    <Tick state={st} past={d < asOf} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <ul aria-label="Key" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-14 text-xs text-muted">
        {(["ok", "open", "break", "closed"] as TickState[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5"><Tick state={s} past={false} />{TICK_WORD[s]}</li>
        ))}
        {todayIdx >= 0 && <li className="flex items-center gap-1.5"><span aria-hidden className="h-4 w-px bg-ink/50" />today</li>}
      </ul>
    </div>
  );
}
