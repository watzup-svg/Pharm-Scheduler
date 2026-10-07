// The one month calendar. Each day shows how many people are off as dots (filled = approved, hollow = waiting), a brick chip where stores are
// left short, a flag on holidays and closed days, a ring on the day with the most trouble, and a pill on today. Click or Enter opens the day.
import { useEffect, useMemo, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { weekday, type ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { StateMark } from "../../ui/icons.tsx";
import { cx } from "../../ui/primitives.tsx";
import { dayWords, troubleDay, type DayLoad } from "./calc.ts";
import { monthLoads } from "./lib.ts";
import { shiftMonth, useTimeOffUi } from "./ui.ts";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_DOTS = 6;

function Dots({ off, waiting }: { off: number; waiting: number }) {
  const shown = Math.min(MAX_DOTS, off + waiting);
  const more = off + waiting - shown;
  return (
    <span aria-hidden className="flex items-center gap-[3px]">
      {Array.from({ length: shown }, (_, i) => (i < off
        ? <span key={i} className="size-2 rounded-full bg-warn" />
        : <span key={i} className="size-2 rounded-full border-[1.5px] border-dashed border-warn" />))}
      {more > 0 && <span className="ml-0.5 text-[11px] font-semibold leading-none text-warn">+{more}</span>}
    </span>
  );
}

export function Month() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const ui = useTimeOffUi();
  const ym = ui.month ?? asOf.slice(0, 7);
  const state = world?.state;
  const loads = useMemo(() => (state ? monthLoads(state, asOf, ym) : []), [state, asOf, ym]);
  const trouble = useMemo(() => troubleDay(loads), [loads]);
  const [focusDate, setFocusDate] = useState<ISODate | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const names = useMemo(() => new Map(Object.values(state?.pharmacists ?? {}).map((p) => [p.id, p.name])), [state]);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate]);
  if (!state || !loads.length) return null;

  const name = (id: string) => names.get(id) ?? id;
  const code = (id: string) => state.stores[id]?.code ?? id;
  const first = loads[0]!.date;
  const pad = weekday(first);
  const inMonth = (d: ISODate | null) => (d && d.slice(0, 7) === ym ? d : null);
  const stop = inMonth(focusDate) ?? inMonth(ui.day) ?? (asOf.slice(0, 7) === ym ? asOf : first);
  const title = `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

  const key = (e: React.KeyboardEvent, d: ISODate) => {
    const i = loads.findIndex((l) => l.date === d);
    const to = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" ? i - 7 : e.key === "ArrowDown" ? i + 7 : e.key === "Home" ? 0 : e.key === "End" ? loads.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = loads[Math.max(0, Math.min(loads.length - 1, to))]!.date;
    moved.current = true;
    setFocusDate(next);
  };

  const cell = (l: DayLoad) => {
    const empty = l.short.some((s) => s.empty);
    const hasShort = l.short.length > 0;
    const isTrouble = trouble?.date === l.date;
    const today = l.date === asOf;
    const words = dayWords(l, name, code);
    const label = `${words.join(". ")}${isTrouble ? ". Most trouble this month" : ""}${today ? ". Today" : ""}`;
    const tip = [...words, isTrouble ? "The day with the most trouble this month" : "", "Click to open the day"].filter(Boolean).join(" | ");
    const lit = ui.lit && l.date >= ui.lit.first && l.date <= ui.lit.last;
    return (
      <button
        key={l.date} type="button" data-date={l.date} data-off={l.off.length} data-waiting={l.waiting.length} data-short={l.short.length} data-trouble={isTrouble || undefined} data-today={today || undefined}
        aria-label={label} aria-pressed={ui.day === l.date} data-tip={tip} data-tip-tone={hasShort ? "bad" : l.off.length ? "off" : undefined}
        tabIndex={l.date === stop ? 0 : -1}
        onClick={() => ui.openDay(l.date)} onKeyDown={(e) => key(e, l.date)} onFocus={() => setFocusDate(l.date)}
        className={cx(
          "flex h-[60px] min-w-0 flex-col justify-between rounded-lg px-2 py-1.5 text-left ring-1 ring-inset hover:ring-edge focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
          hasShort ? (empty ? "bg-illegal-bg ring-illegal/50" : "bg-illegal-bg/50 ring-illegal/30") : "bg-cream ring-line",
          l.date < asOf && "opacity-60",
          (isTrouble || ui.day === l.date) && "outline-2 outline-offset-1",
          ui.day === l.date ? "outline-ink" : isTrouble && "outline-illegal",
          lit && "ring-2 ring-warn",
        )}
      >
        <span className="flex items-start justify-between gap-1">
          <span className={cx("text-sm leading-5 tabular-nums", today ? "rounded-full bg-ink px-1.5 font-semibold text-cream" : "font-medium")}>{Number(l.date.slice(8))}</span>
          <span className="flex items-center gap-1">
            {(l.holiday || l.closed.length > 0) && <Flag aria-hidden className="size-3 text-muted" />}
            {hasShort && <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold leading-none text-illegal"><StateMark kind="open" size={16} />{l.short.length > 1 ? l.short.length : null}</span>}
          </span>
        </span>
        <Dots off={l.off.length} waiting={l.waiting.length} />
      </button>
    );
  };

  return (
    <section aria-label="Month" className="min-w-0">
      <div className="mb-2 flex items-center gap-1">
        <h3 className="mr-2 text-lg font-semibold">{title}</h3>
        <button type="button" aria-label="Previous month" onClick={() => ui.setMonth(shiftMonth(ym, -1))} className="grid size-8 place-items-center rounded-md text-lg text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">‹</button>
        <button type="button" aria-label="Next month" onClick={() => ui.setMonth(shiftMonth(ym, 1))} className="grid size-8 place-items-center rounded-md text-lg text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">›</button>
        {ym !== asOf.slice(0, 7) && <button type="button" onClick={() => ui.setMonth(null)} className="ml-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">This month</button>}
      </div>
      <div ref={grid} role="group" aria-label={`Who is off, ${title}`} className="grid grid-cols-7 gap-1.5">
        {WEEK.map((d) => <div key={d} aria-hidden className="pb-0.5 text-center text-xs font-medium text-muted">{d.slice(0, 3)}</div>)}
        {Array.from({ length: pad }, (_, i) => <div key={`p${i}`} aria-hidden />)}
        {loads.map(cell)}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Key">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-warn" /> off</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full border-[1.5px] border-dashed border-warn" /> waiting</span>
        <span className="inline-flex items-center gap-1.5"><StateMark kind="open" size={16} /> store short</span>
        <span className="inline-flex items-center gap-1.5"><Flag aria-hidden className="size-3" /> holiday or closed</span>
      </p>
    </section>
  );
}
