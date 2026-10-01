import { useMemo, useRef } from "react";
import { X } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import type { AddSeed } from "@/components/time-off-add";
import { dayLabel, isToday, isWeekend, Swatch } from "@/components/time-off-parts";
import { useMedia } from "@/components/use-media";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { useStoreTag } from "@/components/use-store-tag";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { monthName, weekdayLong, weekdaySun0 } from "@/lib/schedule/calendar";
import { namePlacements } from "@/lib/schedule/coverage";
import { formatDateList } from "@/lib/schedule/pto";
import { dayRoster } from "@/lib/schedule/roster";
import { dayLoads, entriesOf, firstDate, type DayLoad } from "@/lib/schedule/timeoff-view";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useState } from "react";

type View = "timeline" | "month" | "agenda";

export function CalendarTab({
  focusDay,
  onFocusDay,
  onAdd,
}: {
  focusDay: number | null;
  onFocusDay: (day: number | null) => void;
  onAdd: (seed: AddSeed) => void;
}) {
  const doc = useScheduleStore((s) => s.doc);
  const wide = useMedia("(min-width: 768px)");
  const [picked, setView] = useState<View | null>(null);
  const view: View = picked ? (!wide && picked === "timeline" ? "agenda" : wide && picked === "agenda" ? "timeline" : picked) : wide ? "timeline" : "agenda";
  const loads = useMemo(() => dayLoads(doc), [doc]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span aria-hidden />
        <Segmented<View>
          tone="ink"
          label="View"
          value={view}
          onChange={setView}
          options={[wide ? { value: "timeline", label: "Timeline" } : { value: "agenda", label: "Agenda" }, { value: "month", label: "Month" }]}
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
        <span className="inline-flex items-center gap-2"><Swatch kind="off" /> Time off</span>
        <span className="inline-flex items-center gap-2"><Swatch kind="conflict" /> Off, still scheduled</span>
        <span className="inline-flex items-center gap-2"><Swatch kind="pending" /> Requested</span>
        <span className="inline-flex items-center gap-2"><Swatch kind="thin" /> No spare pharmacist</span>
      </p>

      {view === "timeline" ? <Timeline loads={loads} onFocusDay={onFocusDay} onAdd={onAdd} focusDay={focusDay} /> : null}
      {view === "month" ? <MonthGrid loads={loads} focusDay={focusDay} onFocusDay={onFocusDay} /> : null}
      {view === "agenda" ? <Agenda loads={loads} focusDay={focusDay} onFocusDay={onFocusDay} /> : null}

      {focusDay ? <DayDetail day={focusDay} load={loads[focusDay - 1]!} onClose={() => onFocusDay(null)} onAdd={onAdd} /> : null}
    </div>
  );
}

function Timeline({ loads, onFocusDay, onAdd, focusDay }: { loads: DayLoad[]; onFocusDay: (d: number | null) => void; onAdd: (s: AddSeed) => void; focusDay: number | null }) {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const wrap = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const by = new Map<string, { name: string; first: string; approved: Set<string>; pending: Set<string> }>();
    for (const e of entriesOf(doc)) {
      if (e.status === "declined" || !doc.people.some((p) => p.name === e.t.name)) continue;
      const r = by.get(e.t.name) ?? { name: e.t.name, first: firstDate(e), approved: new Set(), pending: new Set() };
      e.dates.forEach((d) => (e.status === "approved" ? r.approved : r.pending).add(d));
      if (firstDate(e) && firstDate(e) < r.first) r.first = firstDate(e);
      by.set(e.t.name, r);
    }
    const prefix = `${doc.year}-${String(doc.month).padStart(2, "0")}`;
    return [...by.values()]
      .filter((r) => [...r.approved, ...r.pending].some((d) => d.startsWith(prefix)))
      .sort((a, b) => a.first.localeCompare(b.first) || a.name.localeCompare(b.name));
  }, [doc]);
  const conflicts = useMemo(() => {
    const m = new Map<string, Map<number, string>>();
    for (const r of rows) {
      const c = new Map<number, string>();
      for (const p of namePlacements(doc, r.name)) {
        const date = loads[p.day - 1]!.date;
        if (r.approved.has(date)) c.set(p.day, p.store);
      }
      m.set(r.name, c);
    }
    return m;
  }, [rows, doc, loads]);
  const max = Math.max(1, ...loads.map((l) => l.off.length));

  function onKey(e: React.KeyboardEvent) {
    const el = document.activeElement as HTMLElement | null;
    if (!el?.dataset.r) return;
    let r = Number(el.dataset.r);
    let c = Number(el.dataset.c);
    if (e.key === "ArrowRight") c += 1;
    else if (e.key === "ArrowLeft") c -= 1;
    else if (e.key === "ArrowDown") r += 1;
    else if (e.key === "ArrowUp") r -= 1;
    else return;
    const next = wrap.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  if (!rows.length) {
    return (
      <EmptyState kind="timeoff" title="No time off this month" hint="Approved time off and requests appear here by person and day. Use “Add time off” to log the first one." />
    );
  }

  return (
    <div className="surface accent-away p-2 pl-3 sm:p-3 sm:pl-4" ref={wrap} onKeyDown={onKey}>
      <table className="w-full table-fixed border-separate border-spacing-x-px border-spacing-y-0.5 text-xs" aria-label="Time off by person and day. Arrow keys move between days.">
        <colgroup>
          <col style={{ width: "9rem" }} />
          {loads.map((l) => (
            <col key={l.day} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="text-left font-semibold text-muted">Person</th>
            {loads.map((l) => (
              <th key={l.day} scope="col" className={cn("rounded-sm pb-0.5 text-center font-semibold tabular-nums", isWeekend(doc, l.day) ? "bg-shut/60 text-muted" : "text-muted", isToday(doc, l.day) && "border-b-2 border-brand text-ink", focusDay === l.day && "bg-ink text-cream")}>
                <button type="button" className="block w-full" aria-label={`${dayLabel(doc, l.day)}: ${l.off.length} off`} onClick={() => onFocusDay(focusDay === l.day ? null : l.day)}>
                  <span className="block text-xs leading-3 font-normal">{weekdayLong(doc.year, doc.month, l.day).slice(0, 1)}</span>
                  {l.day}
                </button>
              </th>
            ))}
          </tr>
          <tr>
            <th scope="row" className="text-left font-semibold text-muted">On time off that day</th>
            {loads.map((l) => (
              <td key={l.day} className="p-0">
                <span
                  className={cn("relative flex h-6 items-center justify-center rounded-sm text-xs font-bold tabular-nums", l.thin ? "bg-illegal text-cream" : "text-ink")}
                  style={l.thin || !l.off.length ? undefined : { backgroundColor: `rgb(242 213 106 / ${0.3 + 0.7 * (l.off.length / max)})` }}
                  title={l.thin ? `${l.off.length} off, no spare pharmacist` : `${l.off.length} off`}
                >
                  {l.off.length || ""}
                  {l.thin ? <span className="sr-only"> no spare pharmacist</span> : null}
                </span>
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const home = doc.people.find((p) => p.name === r.name)?.home;
            return (
              <tr key={r.name}>
                <th scope="row" className="truncate pr-1 text-left font-medium" title={r.name}>
                  <span className="block truncate text-xs">{r.name}</span>
                  {home && home !== "—" ? <span className="block text-xs font-normal text-muted">{tag(home)}</span> : null}
                </th>
                {loads.map((l, ci) => {
                  const approved = r.approved.has(l.date);
                  const pending = r.pending.has(l.date);
                  const store = conflicts.get(r.name)?.get(l.day);
                  const weekend = isWeekend(doc, l.day);
                  return (
                    <td key={l.day} className="p-0">
                      <button
                        type="button"
                        data-r={ri}
                        data-c={ci}
                        aria-label={`${r.name}, ${dayLabel(doc, l.day)}: ${approved ? `off${store ? `, still on ${tag(store)}` : ""}` : pending ? "requested" : "not off. Add time off"}`}
                        onClick={() => (approved || pending ? onFocusDay(l.day) : onAdd({ names: [r.name], dates: [l.date] }))}
                        className={cn(
                          "grid h-9 w-full place-items-center rounded-sm text-xs font-bold",
                          approved && "bg-warn-bg text-illegal",
                          approved && store && "ring-2 ring-illegal",
                          !approved && pending && "hatch border border-dashed border-warn bg-white",
                          !approved && !pending && (weekend ? "bg-shut/40 hover:bg-shut" : "bg-paper hover:bg-white hover:ring-1 hover:ring-line"),
                          focusDay === l.day && !approved && !pending && "ring-1 ring-ink/40",
                        )}
                      >
                        {approved && store ? <span className="truncate px-px">{tag(store)}</span> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MonthGrid({ loads, focusDay, onFocusDay }: { loads: DayLoad[]; focusDay: number | null; onFocusDay: (d: number | null) => void }) {
  const doc = useScheduleStore((s) => s.doc);
  const pad = weekdaySun0(doc.year, doc.month, 1);
  return (
    <div className="surface accent-away p-2 pl-3 sm:p-3 sm:pl-4">
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Month">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-muted">
            {d}
          </div>
        ))}
        {Array.from({ length: pad }).map((_, i) => (
          <div key={`p${i}`} />
        ))}
        {loads.map((l) => (
          <button
            key={l.day}
            type="button"
            aria-pressed={focusDay === l.day}
            aria-label={`${dayLabel(doc, l.day)}: ${l.off.length} off${l.pending.length ? `, ${l.pending.length} requested` : ""}${l.thin ? ", no spare pharmacist" : ""}`}
            onClick={() => onFocusDay(focusDay === l.day ? null : l.day)}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-start gap-0.5 rounded-md p-2 text-left text-xs",
              l.off.length ? "bg-warn-bg text-warn" : isWeekend(doc, l.day) ? "bg-shut/50" : "bg-paper",
              l.pending.length && !l.off.length && "hatch border border-dashed border-warn",
              l.thin && "ring-2 ring-illegal",
              focusDay === l.day && "outline-2 outline-ink",
              isToday(doc, l.day) && "border-b-4 border-brand",
            )}
          >
            <span className="font-semibold tabular-nums">{l.day}</span>
            {l.off.length ? <span className="font-bold">{l.off.length} off</span> : null}
            {l.pending.length ? <span className="font-medium">+{l.pending.length} asked</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Agenda({ loads, focusDay, onFocusDay }: { loads: DayLoad[]; focusDay: number | null; onFocusDay: (d: number | null) => void }) {
  const doc = useScheduleStore((s) => s.doc);
  const days = loads.filter((l) => l.off.length || l.pending.length || l.thin);
  if (!days.length) {
    return (
      <EmptyState kind="timeoff" title="Nobody is off this month" hint="When someone is, the days show here by week. Use “Add time off” to log it." />
    );
  }
  // One heading per week, so a long month reads as a few short lists.
  const weeks: { label: string; days: DayLoad[] }[] = [];
  for (const l of days) {
    const start = l.day - weekdaySun0(doc.year, doc.month, l.day);
    const label = `Week of ${monthName(doc.year, doc.month).slice(0, 3)} ${Math.max(1, start)}`;
    const w = weeks[weeks.length - 1];
    if (w && w.label === label) w.days.push(l);
    else weeks.push({ label, days: [l] });
  }
  return (
    <div className="flex flex-col gap-4">
      {weeks.map((w) => (
        <section key={w.label} aria-label={w.label}>
          <h2 className="mb-2 text-sm font-semibold text-ink">{w.label}</h2>
          <ul className="flex flex-col gap-2">
            {w.days.map((l) => (
              <li key={l.day}>
                <button
                  type="button"
                  aria-pressed={focusDay === l.day}
                  onClick={() => onFocusDay(focusDay === l.day ? null : l.day)}
                  className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-line", l.thin && "ring-2 ring-illegal", focusDay === l.day && "outline-2 outline-ink")}
                >
                  <span className="w-14 shrink-0 text-sm font-semibold">{weekdayLong(doc.year, doc.month, l.day).slice(0, 3)} {l.day}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    {l.off.length ? <span className="block text-pretty break-words">{l.off.join(", ")}</span> : null}
                    {l.pending.length ? <span className="block truncate text-xs text-warn">Asked: {l.pending.join(", ")}</span> : null}
                    {l.thin ? <span className="block text-xs font-medium text-illegal">No spare pharmacist</span> : null}
                  </span>
                  {l.off.length ? <span className="shrink-0 rounded-full bg-warn-bg px-2 text-xs font-bold text-warn">{l.off.length}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Everything about one date: who is off, who asked, stores left empty, and who could be called. */
function DayDetail({ day, load, onClose, onAdd }: { day: number; load: DayLoad; onClose: () => void; onAdd: (s: AddSeed) => void }) {
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
