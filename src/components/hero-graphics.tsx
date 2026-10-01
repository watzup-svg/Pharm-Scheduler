import { useMemo, useRef } from "react";
import { useNote } from "@/components/hover-note";
import { coverageByDay } from "@/lib/schedule/day-coverage";
import { daysInMonth, monthName, todayParts, weekdayShort, weekdaySun0 } from "@/lib/schedule/calendar";
import type { FixStep } from "@/lib/schedule/fix";
import { stateName, stateOfStore } from "@/lib/schedule/licence";
import { isOpenDay } from "@/lib/schedule/place";
import { isRphRole } from "@/lib/schedule/slots";
import type { ScheduleDoc } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

/** Hover/focus handlers that show a note built from `lines`. Spread on any element. */
function useHover() {
  const { show, hide, card } = useNote();
  const touch = useRef(false);
  const last = useRef<string | null>(null);
  const bind = (lines: string[]) => ({
    "data-notip": true as const,
    onPointerDown: (e: React.PointerEvent) => {
      touch.current = e.pointerType === "touch";
    },
    onPointerEnter: (e: React.PointerEvent) => e.pointerType !== "touch" && show(e.clientX, e.clientY, lines),
    onPointerMove: (e: React.PointerEvent) => e.pointerType !== "touch" && show(e.clientX, e.clientY, lines),
    onPointerLeave: hide,
    onFocus: (e: React.FocusEvent) => {
      const r = (e.currentTarget as Element).getBoundingClientRect();
      show(r.left + r.width / 2, r.top, lines);
    },
    onBlur: hide,
  });
  /** On touch the first tap on a mark reads its note, the second does what the mark does. Mouse and keyboard act at once. */
  const gate = (key: string, lines: string[], el: Element, action: () => void) => {
    if (touch.current && last.current !== key) {
      last.current = key;
      const r = el.getBoundingClientRect();
      show(r.left + r.width / 2, r.top, lines);
      return;
    }
    last.current = null;
    hide();
    action();
  };
  return { bind, card, gate };
}

const MON = (doc: ScheduleDoc) => monthName(doc.year, doc.month).slice(0, 3);

function dayLines(doc: ScheduleDoc, day: number, steps: FixStep[], open: number, covered: number): string[] {
  const head = `${weekdayShort(doc.year, doc.month, day)} ${MON(doc)} ${day}`;
  if (open === 0) return [head, "All stores closed"];
  const here = steps.filter((s) => s.day === day);
  if (!here.length) return [head, `All ${open} open ${open === 1 ? "store is" : "stores are"} covered`];
  return [`${head} · ${here.length} to fix`, ...here.slice(0, 3).map((s) => s.headline), ...(here.length > 3 ? [`and ${here.length - 3} more`] : []), covered < open ? "" : ""].filter(Boolean);
}

/** The month as a ring: green covered, pale brick a problem (thicker = more), hollow closed, a white tick for today. */
export function MonthDial({ doc, steps, onPick }: { doc: ScheduleDoc; steps: FixStep[]; onPick: (day: number) => void }) {
  const { bind, card, gate } = useHover();
  const cover = useMemo(() => coverageByDay(doc), [doc]);
  const days = daysInMonth(doc.year, doc.month);
  const today = todayParts();
  const inMonth = today.year === doc.year && today.month === doc.month;
  const by = new Map<number, number>();
  for (const s of steps) by.set(s.day, (by.get(s.day) ?? 0) + 1);
  const cx = 120;
  const cy = 120;
  const R = 92;
  const P = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const tick = ((today.day - 0.5) / days) * Math.PI * 2 - Math.PI / 2;
  return (
    <div className="relative size-full">
      <svg viewBox="0 0 240 240" className="size-full" role="group" aria-label={`${monthName(doc.year, doc.month)} as a ring of ${days} days; ${steps.length} to fix`}>
        <circle cx={cx} cy={cy} r={R - 18} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" />
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const a0 = ((d - 1) / days) * Math.PI * 2 - Math.PI / 2 + 0.025;
          const a1 = (d / days) * Math.PI * 2 - Math.PI / 2 - 0.025;
          const p = by.get(d) ?? 0;
          const c = cover.find((x) => x.day === d);
          const closed = (c?.open ?? 0) === 0;
          const ro = R + (p ? 4 + p * 3 : 0);
          const ri = R - (p ? 15 : 12);
          const lines = dayLines(doc, d, steps, c?.open ?? 0, c ? c.open - c.holes : 0);
          return (
            <path
              key={d}
              d={`M${P(ro, a0)} A${ro} ${ro} 0 0 1 ${P(ro, a1)} L${P(ri, a1)} A${ri} ${ri} 0 0 0 ${P(ri, a0)}Z`}
              role="button"
              tabIndex={closed ? -1 : 0}
              aria-label={lines.join(". ")}
              onClick={(e) => !closed && gate(`d${d}`, lines, e.currentTarget, () => onPick(d))}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !closed && (e.preventDefault(), onPick(d))}
              {...bind(lines)}
              className={cn("outline-none transition-opacity hover:opacity-80 focus-visible:stroke-white", !closed && "cursor-pointer")}
              fill={p ? "#efd8d2" : closed ? "none" : "#6fb78d"}
              stroke={closed ? "rgba(255,255,255,0.28)" : "none"}
              strokeWidth={1}
              style={p ? { filter: "drop-shadow(0 0 5px rgba(239,216,210,0.6))" } : undefined}
            />
          );
        })}
        {inMonth ? <line x1={cx + 68 * Math.cos(tick)} y1={cy + 68 * Math.sin(tick)} x2={cx + 112 * Math.cos(tick)} y2={cy + 112 * Math.sin(tick)} stroke="#fff" strokeWidth={3} strokeLinecap="round" pointerEvents="none" /> : null}
        <text x={cx} y={cy + 4} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={30} fontWeight={600} letterSpacing={2} pointerEvents="none">
          {MON(doc).toUpperCase()}
        </text>
        <text x={cx} y={cy + 28} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={16} pointerEvents="none">
          {doc.year}
        </text>
      </svg>
      {card}
    </div>
  );
}

type Dot = { n: number; tone: "off" | "bare" | "none"; lines: string[] };

/** A month as dots: bigger = more, amber = people off, pale brick = a store left bare. Hover for the day. */
export function MiniMonth({ doc, dotFor, onPick, dim }: { doc: ScheduleDoc; dotFor: (day: number) => Dot; onPick?: (day: number) => void; dim?: (day: number) => boolean }) {
  const { bind, card, gate } = useHover();
  const days = daysInMonth(doc.year, doc.month);
  const lead = weekdaySun0(doc.year, doc.month, 1);
  const today = todayParts();
  const inMonth = today.year === doc.year && today.month === doc.month;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const max = 4;
  return (
    <div className="relative size-full">
      <div className="grid size-full grid-cols-7 grid-rows-[repeat(7,minmax(0,1fr))] gap-x-0.5" role="group" aria-label={`${monthName(doc.year, doc.month)} by day`}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} aria-hidden className="text-center text-[11px] leading-4 font-semibold text-white/55">{d}</span>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <span key={`b${i}`} />;
          const v = dotFor(d);
          const size = v.tone === "none" ? 0 : 8 + Math.min(v.n, max) * 3;
          const isToday = inMonth && today.day === d;
          return (
            <button
              key={d}
              type="button"
              aria-label={v.lines.join(". ")}
              onClick={(e) => (v.tone !== "none" ? gate(`m${d}`, v.lines, e.currentTarget, () => onPick?.(d)) : gate(`m${d}`, v.lines, e.currentTarget, () => {}))}
              {...bind(v.lines)}
              className={cn("relative flex size-full min-h-0 flex-col items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/70", isToday && "bg-white/15 ring-1 ring-white/30", dim?.(d) && "opacity-50")}
            >
              <span className="grid h-4 place-items-center sm:h-5">
                {v.tone === "none" ? null : (
                  <span
                    aria-hidden
                    className={cn("block origin-center scale-[0.7] rounded-[4px] sm:scale-100", v.tone === "off" && "bg-warn-bg ring-1 ring-warn/35", v.tone === "bare" && "bg-illegal-bg ring-1 ring-illegal/40")}
                    style={{ width: size, height: size, boxShadow: v.tone === "bare" ? "0 0 8px rgba(239,216,210,0.7)" : undefined }}
                  />
                )}
              </span>
              <span aria-hidden className={cn("text-[10px] leading-none tabular-nums", v.tone === "none" ? "text-white/45" : "font-semibold text-white/85", isToday && "font-bold text-white")}>{d}</span>
            </button>
          );
        })}
      </div>
      {card}
    </div>
  );
}

/** One ring per state: the share of pharmacists licensed there. */
export function LicenceRings({ doc }: { doc: ScheduleDoc }) {
  const { bind, card } = useHover();
  const rph = doc.people.filter((p) => isRphRole(p.role));
  const states = [...new Set(doc.stores.map(stateOfStore).filter(Boolean))].sort();
  const total = Math.max(1, rph.length);
  return (
    <div className="relative flex size-full flex-wrap items-center justify-center gap-4">
      {states.map((st) => {
        const n = rph.filter((p) => p.licensedStates?.includes(st)).length;
        const stores = doc.stores.filter((s) => stateOfStore(s) === st).length;
        const r = 30;
        const c = 2 * Math.PI * r;
        const lines = [`${stateName(st)} · ${n} of ${rph.length} pharmacists licensed`, `${stores} ${stores === 1 ? "store" : "stores"} there`];
        return (
          <svg key={st} viewBox="0 0 80 80" role="img" aria-label={lines.join(". ")} tabIndex={0} {...bind(lines)} className="size-24 outline-none sm:size-[6.5rem]">
            <circle cx={40} cy={40} r={r} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.14)" strokeWidth={7} />
            <circle cx={40} cy={40} r={r} fill="none" stroke="#6fb78d" strokeWidth={7} strokeLinecap="round" strokeDasharray={`${(n / total) * c} ${c}`} transform="rotate(-90 40 40)" />
            <text x={40} y={45} textAnchor="middle" fill="#fff" fontSize={16} fontWeight={700}>{st}</text>
          </svg>
        );
      })}
      {card}
    </div>
  );
}

/** Stores open on each weekday, as seven bars. */
export function WeekdayBars({ doc }: { doc: ScheduleDoc }) {
  const { bind, card } = useHover();
  const last = daysInMonth(doc.year, doc.month);
  const sums = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  for (let d = 1; d <= last; d++) {
    const w = weekdaySun0(doc.year, doc.month, d);
    sums[w]!.sum += doc.stores.filter((s) => isOpenDay(doc, s.code, d)).length;
    sums[w]!.n += 1;
  }
  const avg = sums.map((o) => (o.n ? Math.round(o.sum / o.n) : 0));
  const total = Math.max(1, doc.stores.length);
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <div className="relative flex size-full items-end gap-2" role="group" aria-label={`Stores open by weekday, out of ${total}`} data-tip={`Stores open each weekday | Out of ${total} stores, counting closures and holidays`}>
      {avg.map((n, w) => {
        const lines = [names[w]!, `${n} of ${total} stores open`];
        return (
          <div key={w} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" {...bind(lines)} tabIndex={0} role="img" aria-label={lines.join(". ")}>
            <span aria-hidden className="text-[11px] leading-none font-semibold tabular-nums text-white/85">{n}</span>
            <span aria-hidden className={cn("block w-full rounded-t-md", n === 0 ? "bg-white/15" : n < total ? "bg-warn-bg" : "bg-ok-lite")} style={{ height: `${Math.max(6, (n / total) * 70)}%` }} />
            <span aria-hidden className="text-[11px] leading-none text-white/65">{["S", "M", "T", "W", "T", "F", "S"][w]}</span>
          </div>
        );
      })}
      {card}
    </div>
  );
}


/** The pack as a stack of sheets, one per store poster, with a brick notch on the edge of any sheet that still has a problem. */
export function PaperStack({ pages, tip, flagged = [] }: { pages: number; tip: string; flagged?: boolean[] }) {
  const sheets = Math.max(3, Math.min(flagged.length, 12));
  const step = Math.min(7, 44 / sheets);
  return (
    <div data-tip={tip} role="img" aria-label={tip.replace(" | ", ". ")} className="relative m-auto size-full max-h-[11rem] max-w-[8.5rem]">
      {Array.from({ length: sheets }, (_, k) => {
        const i = sheets - 1 - k;
        const bad = flagged[i] === true;
        return (
          <span key={k} aria-hidden className="absolute rounded-md bg-white shadow-[0_4px_10px_-6px_rgba(0,0,0,0.6)]" style={{ top: k === sheets - 1 ? 0 : undefined, bottom: undefined, left: 0, width: "calc(100% - 14px)", height: "calc(100% - 22px)", transform: `translate(${(sheets - 1 - k) * step * 0.35}px, ${(sheets - 1 - k) * step}px)`, opacity: 0.5 + (k / sheets) * 0.5 }}>
            {bad ? <span className="absolute top-1.5 -right-1 h-3 w-1.5 rounded-r-sm bg-illegal" /> : null}
          </span>
        );
      })}
      <span className="absolute top-0 left-0 z-10 flex h-[calc(100%-22px)] w-[calc(100%-14px)] flex-col items-center justify-center text-night"><span className="text-5xl leading-none font-bold tabular-nums">{pages}</span><span className="text-[11px] leading-4 font-semibold tracking-wide uppercase">pages</span></span>
    </div>
  );
}
