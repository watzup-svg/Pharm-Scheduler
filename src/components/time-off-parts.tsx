import { daysInMonth, monthName, weekdayShort, weekdaySun0 } from "@/lib/schedule/calendar";
import type { DayLoad } from "@/lib/schedule/timeoff-view";
import type { ScheduleDoc, TimeOffStatus } from "@/lib/schedule/types";
import { Mark } from "@/components/icons";
import { cn } from "@/lib/utils";

export type Tab = "requests" | "calendar" | "list";

/** "Tue Oct 20" */
export function dayLabel(doc: ScheduleDoc, day: number): string {
  return `${weekdayShort(doc.year, doc.month, day)} ${monthName(doc.year, doc.month).slice(0, 3)} ${day}`;
}

export function isToday(doc: ScheduleDoc, day: number): boolean {
  const now = new Date();
  return now.getFullYear() === doc.year && now.getMonth() + 1 === doc.month && now.getDate() === day;
}

export function isWeekend(doc: ScheduleDoc, day: number): boolean {
  const w = weekdaySun0(doc.year, doc.month, day);
  return w === 0 || w === 6;
}

const PILL: Record<TimeOffStatus, string> = {
  approved: "bg-ok-bg text-ok",
  requested: "bg-warn-bg text-warn",
  declined: "bg-shut text-muted",
};
const PILL_TEXT: Record<TimeOffStatus, string> = { approved: "Approved", requested: "Requested", declined: "Declined" };

export function StatusPill({ status }: { status: TimeOffStatus }) {
  const icon = status === "approved" ? "approved" : status === "requested" ? "requested" : null;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-3 text-xs font-semibold", PILL[status])}>
      {icon ? <Mark icon={icon} className="size-3.5" /> : null}
      {PILL_TEXT[status]}
    </span>
  );
}

/** Small swatch used by the legend and the picker. */
export function Swatch({ kind }: { kind: "off" | "conflict" | "pending" | "thin" | "selected" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-4 shrink-0 rounded-sm",
        kind === "off" && "bg-warn-bg",
        kind === "conflict" && "bg-warn-bg ring-2 ring-illegal",
        kind === "pending" && "hatch border border-dashed border-warn bg-white",
        kind === "thin" && "bg-illegal",
        kind === "selected" && "bg-ink",
      )}
    />
  );
}

/**
 * The month as one strip of day ticks. Shade = how many are off; the outlined days are the ones being asked about;
 * dashed days have other open requests. Always paired with words, never the only signal.
 */
export function MonthStrip({
  doc,
  loads,
  highlight,
  label,
}: {
  doc: ScheduleDoc;
  loads: DayLoad[];
  highlight: Set<string>;
  label: string;
}) {
  const last = daysInMonth(doc.year, doc.month);
  const max = Math.max(1, ...loads.map((l) => l.off.length));
  return (
    <div role="img" aria-label={label}>
      <div className="flex gap-px">
        {loads.map((l) => {
          const mine = highlight.has(l.date);
          return (
            <span
              key={l.day}
              className={cn(
                "relative h-6 min-w-0 flex-1 rounded-[2px]",
                isWeekend(doc, l.day) ? "bg-shut/70" : "bg-paper",
                mine && "outline-2 -outline-offset-1 outline-ink",
              )}
            >
              {l.off.length ? (
                <span className="absolute inset-x-0 bottom-0 rounded-[2px] bg-warn-bg ring-1 ring-warn/40" style={{ height: `${Math.max(30, (l.off.length / max) * 100)}%` }} />
              ) : null}
              {l.pending.length ? <span className="hatch absolute inset-0 rounded-[2px] border border-dashed border-warn" /> : null}
            </span>
          );
        })}
      </div>
      <div className="relative mt-0.5 h-4 text-xs text-muted" aria-hidden>
        {[1, 8, 15, 22, 29].filter((d) => d <= last).map((d) => (
          <span key={d} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${((d - 0.5) / last) * 100}%` }}>
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
