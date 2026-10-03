import { useMemo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import type { AddSeed } from "@/components/time-off-add";
import { announce } from "@/components/undo";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { useStoreTag } from "@/components/use-store-tag";
import { Button } from "@/components/ui/button";
import { HoldButton } from "@/components/ui/hold-button";
import { isoDate } from "@/lib/schedule/calendar";
import { namePlacements } from "@/lib/schedule/coverage";
import { formatDateList } from "@/lib/schedule/pto";
import { entriesOf, firstDate, type TimeOffEntry } from "@/lib/schedule/timeoff-view";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";

/** Approved or Declined entries, soonest first. With a day picked on the month, only entries that cover it. */
export function EntryList({ status, day, onEdit }: { status: "approved" | "declined"; day: string | null; onEdit: (seed: AddSeed) => void }) {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const remove = useScheduleStore((s) => s.removeTimeOff);
  const setStatus = useScheduleStore((s) => s.setTimeOffStatus);
  const showOnSchedule = useShowOnSchedule();
  const all = useMemo(() => entriesOf(doc), [doc]);
  const monthPrefix = `${doc.year}-${String(doc.month).padStart(2, "0")}`;

  // Who is still scheduled on a day they are off: only approved time off counts.
  const sitting = useMemo(() => {
    const m = new Map<number, ReturnType<typeof namePlacements>>();
    for (const e of all) {
      if (e.status !== "approved") continue;
      const set = new Set(e.dates);
      const hits = namePlacements(doc, e.t.name).filter((c) => set.has(isoDate(doc.year, doc.month, c.day)));
      if (hits.length) m.set(e.index, hits);
    }
    return m;
  }, [all, doc]);

  const visible = all
    .filter((e) => e.status === status)
    .filter((e) => !day || e.dates.includes(day))
    .sort((a, b) => firstDate(a).localeCompare(firstDate(b)) || a.t.name.localeCompare(b.t.name));

  function row(e: TimeOffEntry) {
    const hits = sitting.get(e.index);
    const inMonth = e.dates.some((d) => d.startsWith(monthPrefix));
    return (
      <li key={e.index} className="surface flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate font-medium">{e.t.name}</p>
          {e.t.note ? <p className="truncate text-xs text-muted">{e.t.note}</p> : null}
        </div>
        <p className={cn("text-sm", inMonth ? "" : "text-muted")}>
          {formatDateList(e.dates)} · {e.dates.length}d{inMonth ? "" : " · not this month"}
        </p>
        <div className="ml-auto flex items-center">
          {e.status === "approved" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-tip="Back to Requests | Stops counting as time off. Nobody already placed is moved"
              aria-label={`Undo approval for ${e.t.name}, ${formatDateList(e.dates)}`}
              onClick={() => {
                setStatus(e.index, "requested");
                announce(`${e.t.name}, ${formatDateList(e.dates)} is back on Requests.`);
              }}
            >
              Undo approval
            </Button>
          ) : null}
          {e.status === "declined" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setStatus(e.index, "requested")}>
              Reopen
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${e.t.name}, ${formatDateList(e.dates)}`} onClick={() => onEdit({ editIndex: e.index })}>
            <Pencil />
          </Button>
          <HoldButton
            variant="ghost"
            size="icon"
            aria-label={`Remove ${e.t.name}, ${formatDateList(e.dates)}. Press and hold.`}
            title="Press and hold to remove"
            onHold={() => {
              remove(e.index);
              announce(`Removed ${e.t.name}, ${formatDateList(e.dates)}`);
            }}
          >
            <Trash2 />
          </HoldButton>
        </div>
        {hits ? (
          <p className="flex basis-full flex-wrap items-center gap-2 text-sm font-medium text-illegal">
            Still on {hits.map((c) => `${tag(c.store)} ${c.day}`).join(", ")}; prints yellow.
            <Button type="button" variant="ghost" size="sm" onClick={() => showOnSchedule(hits[0]!, true)}>
              Show on schedule
            </Button>
          </p>
        ) : null}
      </li>
    );
  }

  if (!visible.length) {
    return day ? (
      <EmptyState kind="timeoff" title={`Nothing ${status} that day`} hint="Clear the day to see the rest." />
    ) : status === "approved" ? (
      <EmptyState kind="timeoff" title="Nothing approved yet" hint="Time off you approve, and sick time, is listed here. Undo approval puts one back in To approve." />
    ) : (
      <EmptyState kind="timeoff" title="Nothing declined" hint="A declined request is listed here. Reopen puts it back in To approve." />
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label={status === "approved" ? "Approved time off" : "Declined time off"}>
      {visible.map(row)}
    </ul>
  );
}
