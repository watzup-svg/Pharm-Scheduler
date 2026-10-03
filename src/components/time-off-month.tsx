import { useMemo } from "react";
import { dayLabel, isToday, isWeekend } from "@/components/time-off-parts";
import { monthName, weekdaySun0 } from "@/lib/schedule/calendar";
import type { DayLoad } from "@/lib/schedule/timeoff-view";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";

/**
 * The one calendar on the Time off page. Each day shows how many people are off: approved in solid yellow, waiting in
 * a lighter dashed weight. Brick = a store would have nobody. Hover names them; click picks the day (the list then
 * shows only what covers it); the days of the selected slip are outlined.
 */
export function TimeOffMonth({
  loads,
  lit,
  day,
  onDay,
}: {
  loads: DayLoad[];
  /** ISO dates of the slip that is open: outlined. */
  lit: Set<string>;
  day: number | null;
  onDay: (d: number | null) => void;
}) {
  const doc = useScheduleStore((s) => s.doc);
  const pad = weekdaySun0(doc.year, doc.month, 1);
  const cells = useMemo(() => loads, [loads]);
  return (
    <div className="surface accent-away p-3 pl-4">
      <h2 className="mb-2 text-sm font-semibold">
        {monthName(doc.year, doc.month)} {doc.year}
      </h2>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Who is off, by day">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-muted">
            {d}
          </div>
        ))}
        {Array.from({ length: pad }).map((_, i) => (
          <div key={`p${i}`} />
        ))}
        {cells.map((l) => {
          const off = l.off.length;
          const wait = l.pending.length;
          const tip = [
            `${dayLabel(doc, l.day)} · ${off ? `${off} off` : "nobody off"}${wait ? `, ${wait} waiting` : ""}`,
            ...(off ? [l.off.join(", ")] : []),
            ...(wait ? [`Waiting: ${l.pending.join(", ")}`] : []),
            ...(l.uncovered.length ? ["A store would have no pharmacist"] : []),
          ].join(" | ");
          return (
            <button
              key={l.day}
              type="button"
              aria-pressed={day === l.day}
              aria-label={tip.replace(/ \| /g, ". ")}
              data-tip={tip}
              data-day={l.day}
              onClick={() => onDay(day === l.day ? null : l.day)}
              className={cn(
                "relative flex aspect-[5/4] min-w-0 flex-col items-start justify-between rounded-md p-1.5 text-left text-xs",
                off ? "bg-warn-bg text-warn" : isWeekend(doc, l.day) ? "bg-shut/50" : "bg-paper",
                wait && !off && "hatch border border-dashed border-warn",
                l.uncovered.length && "ring-2 ring-illegal",
                lit.has(l.date) && "outline-2 outline-ink",
                day === l.day && "outline-2 outline-offset-1 outline-ink",
                isToday(doc, l.day) && "border-b-4 border-brand",
              )}
            >
              <span className="font-semibold tabular-nums">{l.day}</span>
              <span className="flex items-center gap-1 font-bold tabular-nums">
                {off ? off : null}
                {wait ? <span className={cn("font-medium", off ? "opacity-70" : "")}>{off ? `+${wait}` : wait}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
