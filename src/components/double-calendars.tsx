import { useMemo } from "react";
import { shortNames } from "@/components/day-view";
import { daysInMonth, isStoreOpen } from "@/lib/schedule/calendar";
import { getCell } from "@/lib/schedule/grid";
import { calendarWeeks } from "@/lib/schedule/print-model";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The month for each store a pharmacist is booked at on the same day, so the clash can be judged in context:
 * where else they work that week, and where the gaps are. The clash day is outlined. Tap a day to open it.
 */
export function DoubleCalendars({ name, stores, day }: { name: string; stores: string[]; day: number }) {
  const doc = useScheduleStore((s) => s.doc);
  const openSheet = useViewStore((s) => s.openSheet);
  const short = useMemo(() => shortNames(doc.people), [doc.people]);
  const weeks = useMemo(() => calendarWeeks(doc.year, doc.month), [doc.year, doc.month]);
  const last = daysInMonth(doc.year, doc.month);

  return (
    <section aria-label={`${name}’s two stores`} className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="text-sm font-semibold text-ink">{name.split(" ")[0]}’s two stores</h3>
      {stores.map((code) => {
        const store = doc.stores.find((s) => s.code === code);
        if (!store) return null;
        return (
          <div key={code} className="rounded-xl bg-white p-3 ring-1 ring-line">
            <p className="mb-2 text-sm font-semibold">{store.name}</p>
            <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-semibold text-muted" aria-hidden>
              {WEEKDAY_LETTERS.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
            <div className="mt-0.5 grid grid-cols-7 gap-0.5">
              {weeks.flat().map((d, i) => {
                if (d == null) return <span key={i} />;
                const open = isStoreOpen(store, doc.year, doc.month, d, last, doc.holidays);
                const names = RPH_SLOTS.map((slot) => getCell(doc.grid, code, slot, d).trim()).filter(Boolean);
                const mine = names.includes(name);
                const hole = open && names.length === 0;
                const here = d === day;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => openSheet(code, d)}
                    aria-label={`${store.name}, day ${d}: ${!open ? "closed" : hole ? "no coverage" : names.join(" and ")}`}
                    className={cn(
                      "flex min-h-11 min-w-0 flex-col items-center rounded-md px-0.5 py-0.5 text-xs leading-tight",
                      !open && "bg-shut text-muted",
                      open && !hole && "bg-paper text-ink",
                      hole && "bg-illegal-bg font-bold text-illegal",
                      mine && "font-bold ring-1 ring-night",
                      here && "outline-2 outline-offset-1 outline-illegal",
                    )}
                  >
                    <span className="tabular-nums text-muted">{d}</span>
                    <span className="w-full truncate">{!open ? "" : hole ? "none" : names.map(short).join("+")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">Dark outline: {name.split(" ")[0]}’s days. Red: no pharmacist. Red box: this day.</p>
    </section>
  );
}
