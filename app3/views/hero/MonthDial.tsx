// The old month dial: a ring with one segment per day, coloured by that day's worst state, a hand at today. Click a day to go there.
// It is the navigator, not a dashboard: every segment acts.
import { useMemo } from "react";
import { api, dateRange, daysInMonth, type DomainState, type ISODate } from "@domain";
import { useViewState } from "../../derive.ts";
import { useApp } from "../../store.ts";
import { goTo } from "../chrome/shared.tsx";
import { fmtDate } from "../../copy.ts";

type Day = "ok" | "fix" | "closed";
const FILL: Record<Day, string> = { ok: "#6fb78d", fix: "#f0cfc7", closed: "#4a424a" };

export function dayStates(state: DomainState, asOf: ISODate, month: string): Map<ISODate, Day> {
  const dates = dateRange(`${month}-01`, `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, "0")}`);
  const ev = api.evaluate(state, asOf, { range: { from: dates[0]!, to: dates[dates.length - 1]! } });
  const out = new Map<ISODate, Day>();
  for (const d of dates) out.set(d, "closed");
  for (const c of Object.values(ev.cells)) {
    if (!out.has(c.date) || out.get(c.date) === "fix") continue;
    if (c.open > 0) out.set(c.date, "fix");
    else if (c.required > 0 || c.counted > 0) out.set(c.date, "ok");
  }
  for (const a of Object.values(state.assignments)) if (out.has(a.date) && ev.assignments[a.id] && !ev.assignments[a.id]!.counts) out.set(a.date, "fix");
  return out;
}

export function MonthDial({ size = 88 }: { size?: number }) {
  const vs = useViewState();
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const month = (asOf >= win.from && asOf <= win.to ? asOf : win.from).slice(0, 7);
  const states = useMemo(() => (vs ? dayStates(vs.state, asOf, month) : null), [vs, asOf, month]);
  if (!states) return null;
  const dates = [...states.keys()];
  const n = dates.length;
  const R = 46, r = 33, c = 50;
  const seg = (i: number) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + 0.03, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - 0.03;
    const p = (rad: number, a: number) => `${c + rad * Math.cos(a)} ${c + rad * Math.sin(a)}`;
    return `M${p(R, a0)} A${R} ${R} 0 0 1 ${p(R, a1)} L${p(r, a1)} A${r} ${r} 0 0 0 ${p(r, a0)}Z`;
  };
  const todayIdx = dates.indexOf(asOf);
  const hand = todayIdx >= 0 ? ((todayIdx + 0.5) / n) * 2 * Math.PI - Math.PI / 2 : null;
  const label = `${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][Number(month.slice(5, 7)) - 1]}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="group" aria-label={`Month dial for ${month}. Each day is a button.`}>
      {dates.map((d, i) => (
        <path key={d} d={seg(i)} fill={FILL[states.get(d)!]} tabIndex={0} role="button" aria-label={`${fmtDate(d)}: ${states.get(d) === "fix" ? "needs attention" : states.get(d) === "closed" ? "nothing scheduled" : "covered"}`}
          data-tip={`${fmtDate(d)} | ${states.get(d) === "fix" ? "Needs attention" : states.get(d) === "closed" ? "Nothing scheduled" : "Covered"} | Open this day`}
          className="cursor-pointer outline-none focus-visible:stroke-white" strokeWidth={1.5} stroke="transparent"
          onClick={() => { const s = useApp.getState(); goTo(s.selection?.storeId ?? Object.keys(vs!.state.stores).sort()[0]!, d); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as SVGPathElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); } }} />
      ))}
      {hand !== null && <line x1={c + (r - 4) * Math.cos(hand)} y1={c + (r - 4) * Math.sin(hand)} x2={c + (R + 2) * Math.cos(hand)} y2={c + (R + 2) * Math.sin(hand)} stroke="#fff" strokeWidth={2} strokeLinecap="round" />}
      <text x="50" y="52" textAnchor="middle" fontSize="11" fontWeight="700" fill="#f7f4ef" fontFamily="'Source Sans 3', system-ui, sans-serif" letterSpacing="1">{label}</text>
      <text x="50" y="64" textAnchor="middle" fontSize="7" fill="#b9b1a3" fontFamily="'Source Sans 3', system-ui, sans-serif">{month.slice(0, 4)}</text>
    </svg>
  );
}
