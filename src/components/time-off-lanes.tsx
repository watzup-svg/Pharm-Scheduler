import { useMemo } from "react";
import { useNote } from "@/components/hover-note";
import { daysInMonth, monthName, todayParts } from "@/lib/schedule/calendar";
import { dayLoads, entriesOf, type TimeOffEntry } from "@/lib/schedule/timeoff-view";
import type { ScheduleDoc } from "@/lib/schedule/types";

function runs(days: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const d of [...days].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && d === last[1] + 1) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

/**
 * Who is away, by day: a lane per person, a rounded bar per absence (solid = approved, dashed = waiting), and a brick
 * band down the days a store would be left with nobody. Every bar and band explains itself on hover.
 */
export function TimeOffLanes({ doc, onPickDay }: { doc: ScheduleDoc; onPickDay: (day: number) => void }) {
  const { show, hide, card } = useNote();
  const days = daysInMonth(doc.year, doc.month);
  const today = todayParts();
  const inMonth = today.year === doc.year && today.month === doc.month;
  const loads = useMemo(() => dayLoads(doc), [doc]);
  const mon = monthName(doc.year, doc.month).slice(0, 3);
  const prefix = `${doc.year}-${String(doc.month).padStart(2, "0")}-`;
  const people = useMemo(() => {
    const by = new Map<string, TimeOffEntry[]>();
    for (const e of entriesOf(doc)) {
      if (e.status === "declined" || !e.dates.some((d) => d.startsWith(prefix))) continue;
      by.set(e.t.name, [...(by.get(e.t.name) ?? []), e]);
    }
    return [...by.entries()].sort((a, b) => (a[1][0]?.dates[0] ?? "").localeCompare(b[1][0]?.dates[0] ?? ""));
  }, [doc, prefix]);
  if (!people.length) return null;
  const shown = people.slice(0, 6);
  const bare = runs(loads.filter((l) => l.uncovered.length).map((l) => l.day));
  const L = 84;
  const W = 640 - L - 8;
  const dx = W / days;
  const lane = 26;
  const H = 22 + shown.length * lane + 8;
  const storeName = (code: string) => doc.stores.find((s) => s.code === code)?.name.replace(/ (Hi-School )?Pharmacy$/i, "") ?? code;
  const hover = (lines: string[]) => ({
    "data-notip": true,
    onPointerEnter: (e: React.PointerEvent) => show(e.clientX, e.clientY, lines),
    onPointerMove: (e: React.PointerEvent) => show(e.clientX, e.clientY, lines),
    onPointerLeave: hide,
    onFocus: (e: React.FocusEvent) => {
      const r = (e.currentTarget as Element).getBoundingClientRect();
      show(r.left + r.width / 2, r.top, lines);
    },
    onBlur: hide,
  });
  return (
    <section aria-label="Who is away" className="surface accent-away overflow-x-auto p-3 pl-4 sm:p-4 sm:pl-5">
      <svg viewBox={`0 0 640 ${H}`} className="mx-auto h-auto w-full min-w-[34rem] max-w-4xl" role="group" aria-label="Who is away, by person and day">
        {[1, Math.round(days / 2), days].map((d) => (
          <text key={d} x={L + (d - 0.5) * dx} y={12} textAnchor="middle" fontSize={11} className="fill-muted tabular-nums">{d}</text>
        ))}
        {bare.map(([a, b]) => {
          const codes = [...new Set(loads.filter((l) => l.day >= a && l.day <= b).flatMap((l) => l.uncovered))];
          const lines = [`${codes.map(storeName).join(", ")} would have no pharmacist`, a === b ? `${mon} ${a}` : `${mon} ${a}–${b}`];
          return <rect key={a} x={L + (a - 1) * dx - 1} y={18} width={(b - a + 1) * dx + 2} height={shown.length * lane + 4} rx={6} className="cursor-pointer fill-illegal-bg/60 stroke-illegal outline-none" strokeDasharray="3 3" {...hover(lines)} tabIndex={0} role="img" aria-label={lines.join(". ")} onClick={() => onPickDay(a)} />;
        })}
        {shown.map(([name, es], i) => {
          const y = 22 + i * lane;
          return (
            <g key={name}>
              <text x={0} y={y + 14} fontSize={12} className="fill-ink">{name.split(" ")[0]} {name.split(" ")[1]?.[0] ?? ""}.</text>
              <line x1={L} x2={L + W} y1={y + 11} y2={y + 11} className="stroke-line" />
              {es.flatMap((e) =>
                runs(e.dates.filter((d) => d.startsWith(prefix)).map((d) => Number(d.slice(8, 10)))).map(([a, b]) => {
                  const ok = e.status !== "requested";
                  const lines = [`${e.t.name} · ${a === b ? `${mon} ${a}` : `${mon} ${a}–${b}`}`, ok ? "Approved" : "Waiting for your decision", ...(e.t.note ? [e.t.note] : [])];
                  return <rect key={`${e.index}-${a}`} x={L + (a - 1) * dx + 1} y={y} width={Math.max(8, (b - a + 1) * dx - 2)} height={22} rx={11} className={ok ? "fill-warn-bg stroke-warn/50 outline-none" : "fill-white stroke-warn outline-none"} strokeDasharray={ok ? undefined : "3 3"} {...hover(lines)} tabIndex={0} role="img" aria-label={lines.join(". ")} />;
                }),
              )}
            </g>
          );
        })}
        {inMonth ? <line x1={L + (today.day - 0.5) * dx} x2={L + (today.day - 0.5) * dx} y1={16} y2={22 + shown.length * lane} className="stroke-ink" strokeWidth={2} /> : null}
      </svg>
      {card}
    </section>
  );
}
