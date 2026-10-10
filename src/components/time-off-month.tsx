import { useMemo } from "react";
import { dayLabel, isToday, isWeekend } from "@/components/time-off-parts";
import { monthName, weekdaySun0 } from "@/lib/schedule/calendar";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { useStoreTag } from "@/components/use-store-tag";
import type { DayLoad, HolidayDay } from "@/lib/schedule/timeoff-view";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";

/**
 * The one calendar on the Time off page. Each day shows how many people are off: approved in solid yellow, waiting in
 * a lighter dashed weight. Brick = a store would have nobody. Hover names them; click picks the day (the list then
 * shows only what covers it); the days of the selected slip are outlined.
 */
export function TimeOffMonth({
  loads,
  holidays,
  lit,
  day,
  onDay,
}: {
  loads: DayLoad[];
  holidays: HolidayDay[];
  /** ISO dates of the slip that is open: outlined. */
  lit: Set<string>;
  day: number | null;
  onDay: (d: number | null) => void;
}) {
  const doc = useScheduleStore((s) => s.doc);
  const pad = weekdaySun0(doc.year, doc.month, 1);
  const cells = useMemo(() => loads, [loads]);
  const tag = useStoreTag();
  const showOnSchedule = useShowOnSchedule();
  const hol = useMemo(() => new Map(holidays.map((h) => [h.day, h])), [holidays]);
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
          const h = hol.get(l.day);
          const named = h?.scheduled ?? null;
          const tip = [
            `${dayLabel(doc, l.day)} · ${off ? `${off} off` : "nobody off"}${wait ? `, ${wait} waiting` : ""}`,
            ...(off ? [l.off.join(", ")] : []),
            ...(wait ? [`Waiting: ${l.pending.join(", ")}`] : []),
            ...(l.uncovered.length ? ["A store would have no pharmacist"] : []),
            ...(h ? [`${h.labels.join(", ")}: closed ${h.closed.length === 1 ? tag(h.closed[0]!) : `${h.closed.length} stores`}`] : []),
            ...(named ? [`${named.name} is still scheduled at ${tag(named.store)}. Click to open the day`] : []),
          ].join(" | ");
          return (
            <button
              key={l.day}
              type="button"
              aria-pressed={day === l.day}
              aria-label={tip.replace(/ \| /g, ". ")}
              data-tip={tip}
              data-day={l.day}
              onClick={() => (named ? showOnSchedule(named, true) : onDay(day === l.day ? null : l.day))}
              className={cn(
                "relative flex aspect-[5/4] min-w-0 flex-col items-start justify-between rounded-md p-1.5 text-left text-xs",
                off ? "bg-warn-bg text-warn" : isWeekend(doc, l.day) ? "bg-shut/50" : "bg-paper",
                wait && !off && "hatch border border-dashed border-warn",
                (l.uncovered.length || named) && "ring-2 ring-illegal",
                named && "bg-illegal-bg",
                lit.has(l.date) && "outline-2 outline-ink",
                day === l.day && "outline-2 outline-offset-1 outline-ink",
                isToday(doc, l.day) && "border-b-4 border-brand",
              )}
            >
              <span className="flex w-full items-baseline justify-between gap-1">
                <span className="font-semibold tabular-nums">{l.day}</span>
                {h ? <span className={cn("min-w-0 truncate text-[10px] leading-none font-medium", named ? "text-illegal" : "text-muted")}>{h.labels[0]}</span> : null}
              </span>
              <span className="flex w-full items-center justify-between gap-1 font-bold tabular-nums">
                <span className="flex items-center gap-1">
                {off ? off : null}
                {wait ? <span className={cn("font-medium", off ? "opacity-70" : "")}>{off ? `+${wait}` : wait}</span> : null}
                </span>
                {h ? <span className="text-[10px] leading-none font-medium text-muted">closed {h.closed.length}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
