import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Label } from "@/components/ui/label";
import { Swatch } from "@/components/time-off-parts";
import { isoDate, monthName, weekdaySun0, daysInMonth } from "@/lib/schedule/calendar";
import { dateClosedForPerson, enumerateIsoRange, formatDateList } from "@/lib/schedule/pto";
import type { DayLoad } from "@/lib/schedule/timeoff-view";
import type { ScheduleDoc } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

/**
 * The one way to pick days in this app. By default tap the first day, then the last (a single day: tap it twice).
 * "Separate days" lets you tap any days one by one. Days when everyone chosen is closed are hatched and can't be picked.
 * Days others are already off show how many. A red dot marks a day that would leave a store with no coverage.
 */
export function DayPicker({
  doc,
  dates,
  onChange,
  names,
  loads,
  label = "Days",
  riskDates,
}: {
  doc: ScheduleDoc;
  dates: string[];
  onChange: (dates: string[]) => void;
  names: string[];
  loads: DayLoad[];
  label?: string;
  /** Dates where taking the chosen people off leaves a store with no coverage. */
  riskDates?: Set<string>;
}) {
  const [mode, setMode] = useState<"days" | "range">("range");
  const [anchor, setAnchor] = useState<string | null>(null);
  const prefix = `${doc.year}-${String(doc.month).padStart(2, "0")}`;
  const padStart = weekdaySun0(doc.year, doc.month, 1);
  const last = daysInMonth(doc.year, doc.month);

  function pickDay(date: string, shift: boolean) {
    if ((mode === "range" || shift) && anchor) {
      const [a, b] = anchor <= date ? [anchor, date] : [date, anchor];
      const stretch = enumerateIsoRange(a, b).filter((d) => d.startsWith(prefix));
      // In a row replaces the pick (a new stretch); with Shift it adds to separate days already picked.
      onChange(mode === "range" ? stretch : [...new Set([...dates, ...stretch])].sort());
      setAnchor(null);
      return;
    }
    setAnchor(date);
    if (mode === "range") {
      onChange([date]);
      return;
    }
    onChange(dates.includes(date) && !shift ? dates.filter((d) => d !== date) : [...new Set([...dates, date])].sort());
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          {label} · {monthName(doc.year, doc.month)} {doc.year}
        </Label>
        <Segmented
          tone="ink"
          label="Selection mode"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setAnchor(null);
          }}
          options={[
            { value: "range", label: "In a row" },
            { value: "days", label: "Separate days" },
          ]}
        />
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {mode === "range"
          ? anchor
            ? "Now tap the last day. Tap the same day again if it is just one."
            : "Tap the first day."
          : "Tap each day. Tap a picked day again to take it off."}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Swatch kind="selected" /> Picked</span>
        <span className="inline-flex items-center gap-1"><span aria-hidden className="text-xs font-semibold text-warn">2 off</span> others already off</span>
        {riskDates ? <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-full bg-illegal" /> a store would have no coverage</span> : null}
      </p>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={label}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold text-muted">
            {d}
          </div>
        ))}
        {Array.from({ length: padStart }).map((_, i) => (
          <div key={`p${i}`} />
        ))}
        {Array.from({ length: last }, (_, i) => i + 1).map((d) => {
          const date = isoDate(doc.year, doc.month, d);
          const on = dates.includes(date);
          const shut = names.length > 0 && names.every((n) => dateClosedForPerson(doc, n, date));
          const offOthers = loads[d - 1]!.off.filter((n) => !names.includes(n)).length;
          const risky = Boolean(riskDates?.has(date)) && !shut;
          return (
            <button
              key={d}
              type="button"
              disabled={shut}
              aria-pressed={on}
              aria-label={`${monthName(doc.year, doc.month)} ${d}${shut ? ", closed" : ""}${offOthers ? `, ${offOthers} already off` : ""}${risky ? ", a store would have no coverage" : ""}`}
              onClick={(e) => pickDay(date, e.shiftKey)}
              className={cn(
                "relative flex min-h-11 flex-col items-center justify-center rounded-md text-sm tabular-nums",
                shut && "bg-black/[0.06] text-muted",
                !shut && on && "bg-ink font-semibold text-cream",
                !shut && !on && "bg-paper",
                anchor === date && "outline-2 outline-ink",
              )}
            >
              {d}
              {risky ? <span aria-hidden className={cn("absolute top-1 right-1 size-2 rounded-full", on ? "bg-white ring-1 ring-illegal" : "bg-illegal")} /> : null}
              {offOthers ? <span className={cn("text-xs leading-none font-semibold", on ? "text-cream" : "text-warn")}>{offOthers} off</span> : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">{dates.length ? `${formatDateList(dates)} · ${dates.length} ${dates.length === 1 ? "day" : "days"}` : "No days picked yet."}</span>
        {dates.length ? (
          <button
            type="button"
            className="min-h-11 px-1 text-sm font-medium underline"
            onClick={() => {
              onChange([]);
              setAnchor(null);
            }}
          >
            Clear days
          </button>
        ) : null}
      </div>
    </section>
  );
}
