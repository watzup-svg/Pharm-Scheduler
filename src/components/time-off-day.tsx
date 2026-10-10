import { useMemo } from "react";
import { X } from "lucide-react";
import type { AddSeed } from "@/components/time-off-add";
import { dayLabel } from "@/components/time-off-parts";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { useStoreTag } from "@/components/use-store-tag";
import { Button } from "@/components/ui/button";
import { monthName, weekdayLong } from "@/lib/schedule/calendar";
import { namePlacements } from "@/lib/schedule/coverage";
import { formatDateList } from "@/lib/schedule/pto";
import { dayRoster } from "@/lib/schedule/roster";
import { entriesOf, type DayLoad } from "@/lib/schedule/timeoff-view";
import { useScheduleStore } from "@/store/schedule-store";

/** Everything about one date: who is off, who asked, stores left empty, and who could be called. */
export function DayDetail({ day, load, onClose, onAdd }: { day: number; load: DayLoad; onClose: () => void; onAdd: (s: AddSeed) => void }) {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const showOnSchedule = useShowOnSchedule();
  const roster = useMemo(() => dayRoster(doc, ev, day), [doc, ev, day]);
  return (
    <section aria-label={`${dayLabel(doc, day)} details`} className="surface accent-away flex flex-col gap-3 p-4 pl-5" role="region">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">
          {weekdayLong(doc.year, doc.month, day)}, {monthName(doc.year, doc.month)} {day}
        </h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Close day details" onClick={onClose} className="-mt-2 -mr-2">
          <X />
        </Button>
      </div>
      {load.thin ? <p className="rounded-lg bg-illegal-bg px-3 py-2 text-sm font-medium text-illegal">No spare pharmacist this day. One more absence leaves a store with no coverage.</p> : null}
      {load.uncovered.length ? (
        <div className="flex flex-col gap-2 rounded-lg bg-illegal-bg px-3 py-2 text-sm" role="status">
          <p className="font-semibold text-illegal">Stores whose only scheduled pharmacist is off: {load.uncovered.map((c) => tag(c)).join(", ")}</p>
          {load.uncovered.map((code) => {
            const name = load.off.find((n) => namePlacements(doc, n).some((c) => c.store === code && c.day === day));
            const cell = name ? namePlacements(doc, name).find((c) => c.store === code && c.day === day) : undefined;
            return cell ? (
              <div key={code}>
                <Button type="button" variant="away" size="sm" onClick={() => showOnSchedule(cell, true)}>
                  Find cover for {tag(code)}
                </Button>
              </div>
            ) : null;
          })}
        </div>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold text-ink">Off ({load.off.length})</h3>
        {load.off.length ? (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {load.off.map((n) => {
              const cell = namePlacements(doc, n).find((c) => c.day === day);
              const entry = entriesOf(doc).find((e) => e.status === "approved" && e.t.name === n && e.dates.includes(load.date));
              return (
                <li key={n} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{n}</span>
                  {entry ? <span className="text-muted">{formatDateList(entry.dates)}{entry.t.note ? ` · ${entry.t.note}` : ""}</span> : null}
                  {cell ? (
                    <button type="button" className="min-h-11 text-illegal underline" onClick={() => showOnSchedule(cell, true)}>
                      still on {tag(cell.store)}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">Nobody.</p>
        )}
      </div>
      {load.pending.length ? (
        <div>
          <h3 className="text-sm font-semibold text-ink">Requested, not decided ({load.pending.length})</h3>
          <p className="mt-1 text-sm">{load.pending.join(", ")}</p>
        </div>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold text-ink">Free to call</h3>
        <p className="mt-1 text-sm text-pretty">
          {roster.free.length ? roster.free.map((p) => `${p.name} (${p.float ? "float " : ""}${tag(p.home)})`).join(", ") : "Nobody is free."}
        </p>
      </div>
      <div>
        <Button type="button" variant="away" size="sm" onClick={() => onAdd({ dates: [load.date] })}>
          Add time off for this day
        </Button>
      </div>
    </section>
  );
}
