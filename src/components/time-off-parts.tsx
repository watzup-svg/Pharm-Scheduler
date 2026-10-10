import { monthName, weekdayShort, weekdaySun0 } from "@/lib/schedule/calendar";
import type { ScheduleDoc, TimeOffStatus } from "@/lib/schedule/types";
import { Mark } from "@/components/icons";
import { cn } from "@/lib/utils";

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
