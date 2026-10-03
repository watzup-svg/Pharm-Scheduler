import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { AddTimeOffDrawer, type AddSeed } from "@/components/time-off-add";
import { DayDetail } from "@/components/time-off-day";
import { dayLabel } from "@/components/time-off-parts";
import { EntryList } from "@/components/time-off-list";
import { TimeOffMonth } from "@/components/time-off-month";
import { ToApproveList, waitingRows } from "@/components/time-off-requests";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Mark } from "@/components/icons";
import { AlarmMark, StateMark } from "@/components/marks";
import { Count, HeroLead, PageStrip } from "@/components/page-strip";
import { dayLoads, holidayDays, nextHoliday, summarize } from "@/lib/schedule/timeoff-view";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

type Filter = "waiting" | "approved" | "declined";

/** The header picture: where every request stands, as three bars. Not a calendar; the month below is the only one. */
function StandingBars({ waiting, approved, declined }: { waiting: number; approved: number; declined: number }) {
  const max = Math.max(1, waiting, approved, declined);
  const rows: [string, number, string][] = [
    ["To approve", waiting, "bg-warn-bg"],
    ["Approved", approved, "bg-ok-lite"],
    ["Declined", declined, "bg-white/35"],
  ];
  return (
    <div className="flex size-full flex-col justify-center gap-4" role="group" aria-label={`To approve ${waiting}, approved ${approved}, declined ${declined}`} data-tip="Time off by decision | Every entry this file holds, not only this month">
      {rows.map(([label, n, tone]) => (
        <div key={label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-[11px] leading-none text-white/75">
            <span>{label}</span>
            <span className="font-semibold tabular-nums text-white">{n}</span>
          </div>
          <span aria-hidden className="h-2.5 rounded-full bg-white/10">
            <span className={cn("block h-full rounded-full", tone)} style={{ width: `${n ? Math.max(8, (n / max) * 100) : 0}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function TimeOffScreen() {
  const doc = useScheduleStore((s) => s.doc);
  const loads = useMemo(() => dayLoads(doc), [doc]);
  const hols = useMemo(() => holidayDays(doc), [doc]);
  const nextHol = useMemo(() => nextHoliday(doc, hols), [doc, hols]);
  const sum = useMemo(() => summarize(doc, loads), [doc, loads]);
  const saved = useViewStore((s) => s.timeOffFilter);
  const setSaved = useViewStore((s) => s.setTimeOffFilter);
  const [filter, setFilterState] = useState<Filter>(saved ?? (sum.waiting > 0 ? "waiting" : "approved"));
  const [seed, setSeedState] = useState<AddSeed | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const counts = useMemo(
    () => ({
      approved: doc.timeOff.filter((t) => (t.status ?? "approved") === "approved").length,
      declined: doc.timeOff.filter((t) => t.status === "declined").length,
    }),
    [doc.timeOff],
  );
  const dayIso = day ? loads[day - 1]?.date ?? null : null;

  // The days of the open slip, outlined on the month.
  const lit = useMemo(() => {
    if (filter !== "waiting") return new Set<string>();
    const rows = waitingRows(doc).filter((e) => !dayIso || e.dates.includes(dayIso));
    const open = rows.find((e) => e.index === selected) ?? rows[0];
    return new Set(open?.dates ?? []);
  }, [doc, filter, selected, dayIso]);

  // Opening the drawer remembers what had focus; closing gives it back (the drawer is remounted per seed, so the
  // dialog's own restore can't be relied on).
  function setSeed(next: AddSeed | null) {
    if (next) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSeedState(next);
    if (!next) {
      const el = opener.current;
      opener.current = null;
      window.setTimeout(() => {
        if (el && el.isConnected) el.focus();
      }, 0);
    }
  }

  function setFilter(f: Filter) {
    setFilterState(f);
    setSaved(f);
  }

  // Nothing waiting: the queue is one line and the month takes the width.
  const wide = filter === "waiting" && sum.waiting === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6">
      <PageStrip
        title="Time off"
        glow="away"
        lead={
          <HeroLead n={sum.waiting} tone="warn" done={!sum.waiting} mark="waiting" tip={sum.waiting ? `To approve · ${sum.waiting} | Requests waiting for a yes or a no` : "Nothing to approve | Every request has been decided"} onClick={sum.waiting ? () => setFilter("waiting") : undefined} />
        }
        tiles={
          <>
            {sum.uncoveredShifts ? (
              <Count n={sum.uncoveredShifts} tone="bad" tip={`Stores left with no pharmacist · ${sum.uncoveredShifts} | Approved time off that leaves a store bare`}>
                <AlarmMark kind="hole" size={28} tip={false} onDark />
              </Count>
            ) : null}
            {sum.stillScheduled ? (
              <Count n={sum.stillScheduled} tone="warn" tip={`Still scheduled · ${sum.stillScheduled} | Named on a day they are off. Prints in yellow`} onClick={() => setFilter("approved")}>
                <StateMark kind="timeOff" size={28} tip={false} />
              </Count>
            ) : null}
          </>
        }
        actions={
          <Button type="button" variant="away" aria-label="Add time off" onClick={() => setSeed({})}>
            <Mark icon="timeOff" tip={false} />
            Add
          </Button>
        }
        graphic={<StandingBars waiting={sum.waiting} approved={counts.approved} declined={counts.declined} />}
      />

      <div className={cn("grid items-start gap-6", !wide && "lg:grid-cols-[40rem_minmax(0,1fr)]")}>
        <section aria-label="Time off queue" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Filter>
              tone="ink"
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "waiting", label: "To approve", hint: String(sum.waiting) },
                { value: "approved", label: "Approved", hint: String(counts.approved) },
                { value: "declined", label: "Declined", hint: String(counts.declined) },
              ]}
            />
            {day ? (
              <button type="button" onClick={() => setDay(null)} aria-label={`Showing ${dayLabel(doc, day)} only. Clear`} className="inline-flex h-11 items-center gap-1.5 rounded-md bg-warn-bg px-3 text-sm font-semibold text-warn">
                {dayLabel(doc, day)}
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <div key={filter} className="hs-fade">
            {filter === "waiting" ? <ToApproveList day={dayIso} selected={selected} onSelect={setSelected} /> : <EntryList status={filter} day={dayIso} onEdit={setSeed} />}
          </div>
        </section>

        <aside aria-label="Month" className={cn("flex min-w-0 flex-col gap-3 max-lg:order-first", !wide && "lg:sticky lg:top-4")}>
          <TimeOffMonth loads={loads} holidays={hols} lit={lit} day={day} onDay={setDay} />
          {sum.busiest || nextHol ? (
            <p className="text-sm text-muted">
              {sum.busiest ? `Busiest day: ${dayLabel(doc, sum.busiest.day)}, ${sum.busiest.off} of ${sum.busiest.total} off.` : null}
              {sum.busiest && nextHol ? " " : null}
              {nextHol ? `Next holiday: ${nextHol.labels[0]}, ${dayLabel(doc, nextHol.day)}.` : null}
            </p>
          ) : null}
          {day ? <DayDetail day={day} load={loads[day - 1]!} onClose={() => setDay(null)} onAdd={setSeed} /> : null}
        </aside>
      </div>

      <AddTimeOffDrawer key={seed ? JSON.stringify(seed) : "closed"} seed={seed} onClose={() => setSeed(null)} />
    </div>
  );
}
