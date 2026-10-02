import { glowClass, placeFromBench, usePlacingGlow } from "@/components/placing";
import { glowKey, type Glow } from "@/lib/schedule/glow";
import { Mark } from "@/components/icons";
import { AlarmMark, QuietMark } from "@/components/marks";
import { usePrintStatus } from "@/components/use-print-status";
import { ChevronDown, Printer } from "lucide-react";
import { memo, useRef, useState } from "react";
import { useMedia } from "@/components/use-media";
import { useStoreTag } from "@/components/use-store-tag";
import { dayDomId, toneOf, type DayView, type DayName } from "@/components/day-view";
import { monthName, monthWeeks, weekdayShort, WEEKDAYS } from "@/lib/schedule/calendar";
import { storeHoursLine } from "@/lib/schedule/coverage";
import type { Store } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

const INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export type CalendarStore = {
  store: Store;
  holes: number;
  doubles: number;
  licence: number;
  leftovers: number;
  views: Record<number, DayView>;
};

/** One store's month as a calendar. Every day is one tap target. */
export const StoreCalendar = memo(function StoreCalendar({
  data,
  year,
  month,
  today,
  focusDay,
  person,
  short,
  onOpen,
  onPrint,
  onFocusDay,
  collapsible = false,
}: {
  data: CalendarStore;
  year: number;
  month: number;
  today: number | null;
  focusDay: number | null;
  person: string;
  short: (name: string) => string;
  onOpen: (store: string, day: number, seed?: string) => void;
  onPrint?: (store: string) => void;
  onFocusDay?: (store: string, day: number) => void;
  /** On a phone, a store with nothing to fix starts folded so 18 calendars don't make a 12,000 px page. */
  collapsible?: boolean;
}) {
  const printStatus = usePrintStatus();
  const placing = usePlacingGlow();
  const { store } = data;
  const narrow = useMedia("(max-width: 767px)");
  const hasProblems = data.holes + data.doubles + data.licence + data.leftovers > 0;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const foldable = collapsible && narrow;
  // Once a store has been open (it had a problem, or you went to it) it stays open, so fixing the last problem doesn't fold it away.
  const wasOpen = useRef(false);
  if (hasProblems || focusDay != null || person) wasOpen.current = true;
  const open = !foldable || (userOpen ?? wasOpen.current);
  const tag = useStoreTag();
  // One tab stop per store (arrows move within it): the focused day, else today, else the 1st.
  const tabDay = focusDay ?? today ?? 1;
  const weeks = monthWeeks(year, month);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-day]");
    if (!target) return;
    const day = Number(target.dataset.day);
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (move) {
      e.preventDefault();
      document.getElementById(dayDomId(store.code, day + move))?.focus();
      return;
    }
    // Letters start a name search. Symbols and Ctrl shortcuts belong to the shortcut layer.
    if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      onOpen(store.code, day, e.key);
    }
  }

  return (
    <section
      id={`store-${store.code}`}
      aria-label={`${store.name} calendar`}
      className="scroll-mt-16 surface p-2 [contain-intrinsic-size:auto_26rem] [content-visibility:auto] sm:p-3"
    >
      <header className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-1">
        {foldable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`cal-${store.code}`}
            onClick={() => setUserOpen(!open)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          >
            <h2 data-tip={storeInfo(store)} className="min-w-0 text-pretty break-words text-base font-semibold">{store.name}</h2>
            <span className="text-xs font-semibold text-muted">{tag(store.code)}</span>
            {printStatus.stores.has(store.code) ? <Mark icon="changed" label="Changed since printed" className="text-warn" /> : null}
            {!open && !hasProblems ? <span className="ml-auto text-xs text-muted">All set</span> : <span className="ml-auto" />}
            <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} />
          </button>
        ) : (
          <>
            <h2 data-tip={storeInfo(store)} className="text-base font-semibold">{store.name}</h2>
            <span className="text-xs font-semibold text-muted">{tag(store.code)}</span>
            {printStatus.stores.has(store.code) ? <Mark icon="changed" label="Changed since printed" className="text-warn" /> : null}
          </>
        )}
        {onPrint && open ? (
          <button
            type="button"
            onClick={() => onPrint(store.code)}
            aria-label={`Print the ${store.name} poster`}
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink hover:bg-paper"
          >
            <Printer className="size-4" />
            Print
          </button>
        ) : null}
        <span className="flex w-full flex-wrap gap-2">
          {(
            [
              ["hole", data.holes],
              ["double", data.doubles],
              ["license", data.licence],
              ["leftover", data.leftovers],
            ] as const
          ).map(([k, n]) => (n ? <span key={k} className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums"><AlarmMark kind={k} size={18} />{n}</span> : null))}
        </span>
      </header>
      {open ? (
      <div id={`cal-${store.code}`} role="grid" aria-label={`${store.name} days`} onKeyDown={onKeyDown}>
        <div role="row" className="grid grid-cols-7 gap-1 px-0.5 pb-1">
          {INITIALS.map((d, i) => (
            <div key={i} role="columnheader" aria-label={WEEKDAYS[i]} className="text-center text-xs font-semibold text-muted">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} role="row" className="mb-1 grid grid-cols-7 gap-1 last:mb-0">
            {week.map((day, di) =>
              day == null ? (
                <div key={di} role="gridcell" aria-hidden />
              ) : (
                <DayCell
                  key={di}
                  view={data.views[day]!}
                  isToday={today === day}
                  isFocus={focusDay === day}
                  isTabStop={tabDay === day}
                  repeat={sameAsBefore(data.views[day], data.views[day - 1])}
                  onFocusDay={onFocusDay}
                  person={person}
                  short={short}
                  onOpen={placing.name ? (st, d) => void placeFromBench(st, d) : onOpen}
                  glow={placing.name ? (placing.glow.get(glowKey(store.code, day)) ?? "blocked") : undefined}
                  when={`${weekdayShort(year, month, day)} ${monthName(year, month).slice(0, 3)} ${day}`}
                />
              ),
            )}
          </div>
        ))}
      </div>
      ) : null}
    </section>
  );
});

/** Hours, address and phone: read on hover, not printed on every card. */
function storeInfo(store: Store): string {
  return [store.name, store.hours || storeHoursLine(store.satOpen, store.sunOpen, store.closedWeekdays), store.address, store.phone].filter(Boolean).join(" | ");
}

/** True when a plain open day has exactly the same names, in the same order, as the open day before it. */
function sameAsBefore(view: DayView | undefined, prev: DayView | undefined): boolean {
  if (!view || !prev || !view.open || !prev.open || view.hole || prev.hole) return false;
  const a = view.names.map((n) => n.name).join("|");
  return a !== "" && a === prev.names.map((n) => n.name).join("|");
}

/** The hover note for a day: store and date, what is going on, and its colour edge and mark (the same ones the grid uses). */
function tipOf(view: DayView, name: (code: string) => string, when: string, placing: boolean) {
  const title = `${name(view.store)} · ${when}`;
  const who = view.names.map((n) => n.name).join(", ");
  const open = placing ? "" : " | Open this day";
  const set = (tone: string, mark: string, ...lines: string[]) => ({ tip: [title, ...lines].join(" | ") + open, tone, mark });
  if (!view.open && view.leftover) return set("bad", "leftover", `${who} is still on a closed day`);
  if (!view.open) return set("", "", view.holiday ? `Closed · ${view.holiday}` : "Closed");
  if (view.hole) return set("bad", "hole", "No pharmacist scheduled");
  if (view.holeAccepted) return set("", "asis", "No coverage, left as is");
  const flagged = (pick: (n: DayName) => boolean) => view.names.filter(pick).map((n) => n.name).join(", ");
  if (view.unlicensed) return set("bad", "license", `${flagged((n) => n.unlicensed)} is not licensed in this state`);
  if (view.double) return set("bad", "double", `${flagged((n) => n.double)} is also at another store today`);
  if (view.off) return set("off", "timeOff", `${flagged((n) => n.off)} has the day off`);
  if (view.needsSecond) return set("", "", who, "Usually two pharmacists, one here");
  if (view.cover) return set("ok", "covering", who, view.away ? `Away from home: their store is ${name(view.away)}` : "A float covering here");
  return set("", "", who || "Nobody scheduled");
}

function describe(view: DayView, name: (code: string) => string): string {
  const where = `${name(view.store)} day ${view.day}`;
  if (!view.open && view.leftover) return `${where}: closed but ${view.names.map((n) => n.name).join(", ")} is still on it`;
  if (!view.open) return `${where}: closed${view.holiday ? `, ${view.holiday}` : ""}`;
  if (view.hole) return `${where}: no coverage, no pharmacist scheduled`;
  if (view.holeAccepted) return `${where}: no coverage (left as is)`;
  const second = view.needsSecond ? "; usually two pharmacists, only one here" : "";
  const bits = view.names.map((n) =>
    [n.name, n.unlicensed ? "not licensed in this state" : "", n.double ? "scheduled twice" : "", n.off ? "on time off" : "", n.away ? `away from home, their store is ${name(n.away)}` : n.cover ? "covering" : ""]
      .filter(Boolean)
      .join(", "),
  );
  return `${where}: ${bits.join("; ")}${second}`;
}

const DayCell = memo(function DayCell({
  view,
  isToday,
  isFocus,
  isTabStop,
  repeat,
  onFocusDay,
  person,
  short,
  onOpen,
  glow,
  when,
}: {
  view: DayView;
  /** "Fri Oct 9", for the hover note. */
  when: string;
  isToday: boolean;
  isFocus: boolean;
  isTabStop: boolean;
  /** Same people as the day before: shown quieter so the changes stand out. */
  repeat: boolean;
  onFocusDay?: (store: string, day: number) => void;
  person: string;
  short: (name: string) => string;
  onOpen: (store: string, day: number, seed?: string) => void;
  /** While someone is being placed: how this day looks for them. */
  glow?: Glow;
}) {
  const name = useStoreTag();
  const tip = tipOf(view, name, when, glow !== undefined);
  const closed = !view.open;
  const mine = person && view.names.some((n) => n.name === person);
  const dim = person && !mine;

  // One tag per cell, most serious first. Cover is quiet on purpose.
  const tag = closed
    ? view.leftover
      ? "closed"
      : view.leftoverAccepted
        ? "as is"
        : ""
    : view.unlicensed
      ? "license"
      : view.double
        ? "twice"
        : view.off
        ? "time off"
        : view.cover
          ? view.away
            ? `from ${name(view.away)}`
            : "cover"
          : view.needsSecond
            ? "1 of 2"
            : view.holeAccepted || view.doubleAccepted
              ? "as is"
              : "";

  return (
    <button
      type="button"
      role="gridcell"
      id={dayDomId(view.store, view.day)}
      data-day={view.day}
      data-focus={isFocus || undefined}
      tabIndex={isTabStop ? 0 : -1}
      onFocus={() => onFocusDay?.(view.store, view.day)}
      data-tone={toneOf(view)}
      aria-label={describe(view, name)}
      data-tip={tip.tip}
      data-tip-tone={tip.tone || undefined}
      data-tip-mark={tip.mark || undefined}
      onClick={() => onOpen(view.store, view.day)}
      className={cn(
        "relative flex min-h-[3.75rem] lg:min-h-[4.5rem] min-w-0 scroll-mt-20 flex-col rounded-lg px-[3px] pt-0.5 pb-1 text-left transition-[opacity,box-shadow]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
        // closed
        closed && !view.leftover && "bg-black/[0.06] text-muted",
        // name left on a closed day: hatched, red, struck
        closed && view.leftover && "bg-illegal-bg text-illegal ring-2 ring-illegal",
        // open
        !closed && "bg-white text-ink ring-1 ring-line",
        !closed && view.hole && "border-2 border-dashed border-illegal bg-illegal-bg text-illegal ring-0",
        !closed && view.unlicensed && "border-2 border-dotted border-illegal bg-illegal-bg text-illegal ring-0",
        !closed && view.double && !view.unlicensed && "bg-illegal-bg text-illegal ring-2 ring-illegal",
        !closed && (view.holeAccepted || (view.doubleAccepted && !view.double)) && "border-2 border-dashed border-muted bg-paper ring-0",
        closed && view.leftoverAccepted && "border-2 border-dashed border-muted bg-paper",
        !closed && !view.double && !view.unlicensed && view.off && "bg-warn-bg text-warn ring-1 ring-warn/40",
        !closed && !view.double && !view.unlicensed && !view.off && view.cover && "bg-cover ring-1 ring-ok/40",
        isFocus && "outline-[3px] outline-offset-2 outline-ink",
        mine && "ring-2 ring-ink",
        dim && "opacity-40",
        glow && !closed && glowClass(glow),
        glow && closed && "opacity-25",
      )}
    >
      <span className="flex items-center justify-between gap-0.5 text-xs leading-4">
        <span className={cn("font-semibold tabular-nums", isToday && "rounded-full bg-ink px-1.5 text-cream")}>{view.day}</span>
        {view.note ? <Mark icon="note" className="size-3.5 text-muted" /> : null}
      </span>
      {closed ? (
        view.leftover || view.leftoverAccepted ? (
          <span className="mt-0.5 min-w-0 text-xs leading-tight font-semibold">
            {view.names.map((n) => (
              <span key={n.slot} className="block truncate line-through lg:line-clamp-2 lg:break-words lg:whitespace-normal">
                {short(n.name)}
              </span>
            ))}
          </span>
        ) : (
          <span className="mt-auto truncate text-xs leading-tight">{view.holiday || "closed"}</span>
        )
      ) : view.hole || view.holeAccepted ? (
        <span className="my-auto grid place-items-center">{view.holeAccepted ? <QuietMark kind="asis" size={18} /> : <AlarmMark kind="hole" size={22} tip={false} />}</span>
      ) : (
        <span className="mt-0.5 min-w-0 text-xs leading-tight font-semibold">
          {view.names.map((n: DayName, i) => (
            <span
              key={n.slot}
              className={cn("block min-w-0 border-l-[3px] pl-0.5 truncate lg:line-clamp-2 lg:break-words lg:whitespace-normal text-[10px] tracking-tight sm:pl-0.5 sm:text-[11px]", repeat && !tag && "font-normal text-muted")}
              style={{ borderColor: n.color }}
            >
              {i > 0 ? "+" : ""}
              {short(n.name)}
            </span>
          ))}
        </span>
      )}
      {tag ? (
        <span className="mt-auto flex items-center gap-1">
          {tag === "license" ? <AlarmMark kind="license" size={16} tip={false} /> : null}
          {tag === "twice" ? <AlarmMark kind="double" size={16} tip={false} /> : null}
          {tag === "closed" ? <AlarmMark kind="leftover" size={16} tip={false} /> : null}
          {tag === "time off" ? <QuietMark kind="off" size={12} /> : null}
          {tag === "cover" || tag.startsWith("from ") ? <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-ink max-sm:gap-0 max-sm:tracking-tight"><QuietMark kind="cover" size={12} />{tag.startsWith("from ") ? tag.slice(5) : ""}</span> : null}
          {tag === "as is" ? <QuietMark kind="asis" size={14} /> : null}
          {tag === "1 of 2" ? <span className="rounded-sm bg-warn-bg px-1 text-[11px] font-bold text-warn ring-1 ring-warn/50">1/2</span> : null}
        </span>
      ) : null}
    </button>
  );
});
