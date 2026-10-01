import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { dayView, TONE_CLASS, tagOf, toneOf, shortNames } from "@/components/day-view";
import { Button } from "@/components/ui/button";
import { monthName, WEEKDAYS, weekdaySun0 } from "@/lib/schedule/calendar";
import { shortStoreName } from "@/lib/schedule/fix";
import { weekRanges } from "@/lib/schedule/roster";
import type { Evaluation, ScheduleDoc, Store } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

/** Stores down, days across, one week at a time. Tap a cell to edit that day. */
export function WeekBoard({
  doc,
  ev,
  stores,
  weekStart,
  onWeek,
  person,
  today,
  onOpen,
}: {
  doc: ScheduleDoc;
  ev: Evaluation;
  stores: Store[];
  weekStart: number;
  onWeek: (start: number) => void;
  person: string;
  today: number | null;
  onOpen: (store: string, day: number) => void;
}) {
  const weeks = useMemo(() => weekRanges(doc.year, doc.month), [doc.year, doc.month]);
  const idx = Math.max(0, weeks.findIndex(([a, b]) => weekStart >= a && weekStart <= b));
  const [first, last] = weeks[idx]!;
  const days = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const short = useMemo(() => shortNames(doc.people), [doc.people]);
  const mon = monthName(doc.year, doc.month).slice(0, 3);

  return (
    <section aria-label="Week" className="flex min-w-0 flex-col gap-2 surface p-2 sm:p-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="icon" aria-label="Previous week" disabled={idx === 0} onClick={() => onWeek(weeks[idx - 1]![0])}>
          <ChevronLeft />
        </Button>
        <h2 className="flex-1 text-center text-base font-semibold">
          {mon} {first}–{last}
        </h2>
        <Button type="button" variant="secondary" size="icon" aria-label="Next week" disabled={idx === weeks.length - 1} onClick={() => onWeek(weeks[idx + 1]![0])}>
          <ChevronRight />
        </Button>
      </div>
      <div className="contain-paint overflow-x-auto" role="region" aria-label="Week grid, scrolls sideways">
        <table className="w-full table-fixed border-separate border-spacing-1" style={{ minWidth: `${4.5 + days.length * 4.25}rem` }}>
          <colgroup>
            <col className="w-16 sm:w-32" />
            {days.map((d) => (
              <col key={d} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-cream text-left text-xs font-semibold text-muted">Store</th>
              {days.map((d) => (
                <th key={d} className={cn("text-center text-xs font-semibold text-muted", today === d && "text-ink")}>
                  {WEEKDAYS[weekdaySun0(doc.year, doc.month, d)]}
                  <span className="block tabular-nums">{d}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.code}>
                <th scope="row" className="sticky left-0 z-10 bg-cream pr-1 text-left align-middle">
                  <span className="block w-16 truncate text-xs font-bold sm:w-28">{store.code}</span>
                  <span className="hidden w-28 truncate text-xs font-normal text-muted sm:block">{shortStoreName(store.name)}</span>
                </th>
                {days.map((d) => {
                  const v = dayView(doc, ev, store.code, d);
                  const tone = toneOf(v);
                  const tag = tagOf(v, tone);
                  const mine = person && v.names.some((n) => n.name === person);
                  return (
                    <td key={d} className="p-0">
                      <button
                        type="button"
                        onClick={() => onOpen(store.code, d)}
                        data-tone={tone}
                        aria-label={`${store.name}, ${mon} ${d}: ${v.hole ? "no coverage" : v.names.map((n) => n.name).join(", ") || "closed"}`}
                        className={cn(
                          "flex min-h-11 w-full min-w-0 flex-col items-start justify-center rounded-md px-1 text-left text-xs leading-tight font-semibold",
                          TONE_CLASS[tone],
                          mine && "outline-[3px] outline-brand",
                          person && !mine && "opacity-40",
                        )}
                      >
                        {tone === "closed" ? (
                          <span className="text-xs font-normal">{v.holiday || "closed"}</span>
                        ) : (tone === "hole" || (tone === "accepted" && v.holeAccepted)) ? (
                          <span className="w-full text-center font-bold">NO COVER</span>
                        ) : (
                          <>
                            {v.names.map((n, i) => (
                              <span key={n.slot} className={cn("block max-w-full truncate", tone === "leftover" && "line-through")}>
                                {i > 0 ? "+" : ""}
                                {short(n.name)}
                              </span>
                            ))}
                            {tag ? <span className="mt-0.5 rounded-sm bg-white/70 px-1 text-xs font-bold uppercase">{tag}</span> : null}
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stores.length === 0 ? <p className="px-2 py-4 text-sm text-muted">No stores match this filter.</p> : null}
    </section>
  );
}
