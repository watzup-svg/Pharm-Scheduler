import { useState } from "react";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { daysInMonth, weekdayLong } from "@/lib/schedule/calendar";
import { storeLabel } from "@/lib/schedule/fix";
import { dayRange, isMarkedTwo, openDaysIn, sameWeekdayDays } from "@/lib/schedule/needs-two";
import { useScheduleStore } from "@/store/schedule-store";

/**
 * "Needs two pharmacists" for one store and day, in the day panel. A mark only: nothing is placed. With one pharmacist on a
 * marked day the problem "Needs a second" appears; with none it is the usual "No coverage".
 */
export function NeedsTwo({ store, day }: { store: string; day: number }) {
  const doc = useScheduleStore((s) => s.doc);
  const setNeedsTwo = useScheduleStore((s) => s.setNeedsTwo);
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState(day);
  const [to, setTo] = useState(day);
  const marked = isMarkedTwo(doc, store, day);
  const where = storeLabel(doc, store);
  const weekday = weekdayLong(doc.year, doc.month, day);
  const sameDays = openDaysIn(doc, store, sameWeekdayDays(doc, day));
  const allSame = sameDays.every((d) => isMarkedTwo(doc, store, d));
  const n = daysInMonth(doc.year, doc.month);
  const days = Array.from({ length: n }, (_, i) => i + 1);
  const rangeDays = openDaysIn(doc, store, dayRange(from, to));
  return (
    <div className="rounded-xl bg-paper px-3 py-3 text-sm ring-1 ring-line" data-needs-two>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5"
          checked={marked}
          onChange={(e) => {
            setNeedsTwo(store, [day], e.target.checked);
            announce(e.target.checked ? `${where} needs two pharmacists on the ${day}` : `${where} back to one pharmacist on the ${day}`);
          }}
        />
        <span className="font-medium">Needs two pharmacists this day</span>
      </label>
      <p className="text-muted">
        {marked ? "One pharmacist here shows “Needs a second” and blocks printing until you add one or leave it as is." : "Only a mark. Nobody is placed for you."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sameDays.length > 1 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setNeedsTwo(store, sameDays, !allSame);
              announce(allSame ? `Every ${weekday} cleared at ${where}` : `Every ${weekday} this month marked at ${where}`);
            }}
          >
            {allSame ? `Clear every ${weekday}` : `Every ${weekday} this month`}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={() => setRange(!range)} aria-expanded={range}>
          A range of days…
        </Button>
      </div>
      {range ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span>From the</span>
          <select aria-label="First day" className="min-h-11 rounded-md border border-line bg-white px-2" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span>to the</span>
          <select aria-label="Last day" className="min-h-11 rounded-md border border-line bg-white px-2" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {days.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!rangeDays.length}
            onClick={() => {
              setNeedsTwo(store, rangeDays, true);
              announce(`${rangeDays.length} ${rangeDays.length === 1 ? "day" : "days"} marked at ${where}. Closed days are skipped.`);
            }}
          >
            Mark {rangeDays.length} open {rangeDays.length === 1 ? "day" : "days"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setNeedsTwo(store, dayRange(from, to), false);
              announce(`Marks cleared from the ${Math.min(from, to)} to the ${Math.max(from, to)}`);
            }}
          >
            Clear them
          </Button>
        </div>
      ) : null}
    </div>
  );
}
