import { useStoreTag } from "@/components/use-store-tag";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { dayView, TONE_CLASS, tagOf, toneOf, shortNames } from "@/components/day-view";
import { Button } from "@/components/ui/button";
import { daysInMonth, monthName, weekdayLong } from "@/lib/schedule/calendar";
import { dayRoster } from "@/lib/schedule/roster";
import { shortStoreName } from "@/lib/schedule/fix";
import type { Evaluation, ScheduleDoc, Store } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

/** One date, every store: who is where, and who you could call. */
export function DayBoard({
  doc,
  ev,
  stores,
  day,
  onDay,
  person,
  onOpen,
}: {
  doc: ScheduleDoc;
  ev: Evaluation;
  stores: Store[];
  day: number;
  onDay: (day: number) => void;
  person: string;
  onOpen: (store: string, day: number) => void;
}) {
  const last = daysInMonth(doc.year, doc.month);
  const tag = useStoreTag();
  const roster = useMemo(() => dayRoster(doc, ev, day), [doc, ev, day]);
  const short = useMemo(() => shortNames(doc.people), [doc.people]);
  const open = stores.filter((s) => roster.stores.find((r) => r.store === s.code)?.open);
  const closed = stores.filter((s) => !roster.stores.find((r) => r.store === s.code)?.open);
  // Cover is only worth listing when an open store has nobody.
  const needsCover = open.some((st) => dayView(doc, ev, st.code, day).hole);

  return (
    <section aria-label="Day" className="flex min-w-0 flex-col gap-3 surface p-2 sm:p-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="icon" aria-label="Previous day" disabled={day <= 1} onClick={() => onDay(day - 1)}>
          <ChevronLeft />
        </Button>
        <h2 className="flex-1 text-center text-base font-semibold">
          {weekdayLong(doc.year, doc.month, day)}, {monthName(doc.year, doc.month).slice(0, 3)} {day}
        </h2>
        <Button type="button" variant="secondary" size="icon" aria-label="Next day" disabled={day >= last} onClick={() => onDay(day + 1)}>
          <ChevronRight />
        </Button>
      </div>

      {open.length === 0 ? (
        <p className="rounded-xl bg-paper px-3 py-4 text-center text-sm font-medium text-muted">All stores are closed.</p>
      ) : null}

      <ul className="grid gap-2 sm:grid-cols-2">
        {open.map((store) => {
          const v = dayView(doc, ev, store.code, day);
          const tone = toneOf(v);
          const label = tagOf(v, tone, tag);
          const mine = person && v.names.some((n) => n.name === person);
          return (
            <li key={store.code}>
              <button
                type="button"
                onClick={() => onOpen(store.code, day)}
                data-tone={tone}
                className={cn(
                  "flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left",
                  TONE_CLASS[tone],
                  mine && "outline-[3px] outline-brand",
                  person && !mine && "opacity-50",
                )}
              >
                <span className="w-10 shrink-0 text-xs font-bold">{tag(store.code)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {v.hole || v.holeAccepted ? "No coverage" : v.names.map((n) => short(n.name)).join(" + ")}
                  </span>
                  <span className="block truncate text-xs font-normal opacity-80">{shortStoreName(store.name)}</span>
                </span>
                {label ? <span className="shrink-0 rounded-sm bg-white/70 px-2 text-xs font-bold uppercase">{label}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {closed.length && open.length ? (
        <p className="px-1 text-xs text-muted">
          Closed: {closed.map((s) => s.code).join(", ")}
        </p>
      ) : null}

      {needsCover ? (
      <div className="rounded-xl bg-white p-3 ring-1 ring-line">
        <h3 className="text-sm font-semibold text-ink">Free to cover</h3>
        {roster.free.length ? (
          <p className="mt-1 text-sm text-pretty">
            {roster.free.slice(0, 8).map((p) => `${p.name} (${p.float ? "float " : ""}${tag(p.home)})`).join(", ")}
            {roster.free.length > 8 ? ` and ${roster.free.length - 8} more` : ""}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">No one is free to cover this day.</p>
        )}
        {roster.off.length ? <p className="mt-2 text-xs text-warn">On time off: {roster.off.join(", ")}</p> : null}
      </div>
      ) : null}
    </section>
  );
}
