import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { DaySheet } from "@/components/day-sheet";
import { dayDomId, dayView, shortNames } from "@/components/day-view";
import { DayBoard } from "@/components/day-board";
import { MonthTools } from "@/components/month-tools";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { StartNextMonthButton } from "@/components/start-next-month";
import { useShortcuts } from "@/components/use-shortcuts";
import { WeekBoard } from "@/components/week-board";
import { MarkLegend } from "@/components/month-grid";
import { PlaceBar } from "@/components/placing";
import { StoreCalendar, type CalendarStore } from "@/components/store-calendar";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { daysInMonth, monthName, todayParts, weekdayShort } from "@/lib/schedule/calendar";
import { stateName, stateOfStore, statesInUse } from "@/lib/schedule/hints";
import { nextYearMonth } from "@/lib/schedule/next-month";
import { filterStores } from "@/lib/schedule/roster";
import { namePlacements } from "@/lib/schedule/coverage";
import { groupHolesByDay } from "@/lib/schedule/fix";
import { nextNamed } from "@/lib/schedule/jump";
import { dropLine } from "@/lib/schedule/next-month";
import { isRphRole } from "@/lib/schedule/slots";
import { cn } from "@/lib/utils";
import { useStoreTag } from "@/components/use-store-tag";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";
import { useIssueNav } from "@/components/issue-nav";

/** Store chips, Today, Person, Tools, and one calendar per store. */
export function MonthBoard() {
  const tag = useStoreTag();
  // The store chips scroll sideways; fade the right edge while there are more of them out of view.
  const chipRow = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  function updateFade() {
    const el = chipRow.current;
    setMoreRight(Boolean(el && el.scrollWidth > el.clientWidth + 2 && el.scrollLeft + el.clientWidth < el.scrollWidth - 2));
  }
  useEffect(() => {
    updateFade();
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  });
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const lastDrops = useScheduleStore((s) => s.lastDrops);
  const lastNewHoles = useScheduleStore((s) => s.lastNewHoles);
  const dismissDrops = useScheduleStore((s) => s.dismissDrops);
  const dismissNewHoles = useScheduleStore((s) => s.dismissNewHoles);
  const storeTab = useViewStore((s) => s.storeTab);
  const setStoreTab = useViewStore((s) => s.setStoreTab);
  const focus = useViewStore((s) => s.focus);
  const person = useViewStore((s) => s.person);
  const setPerson = useViewStore((s) => s.setPerson);
  const goTo = useViewStore((s) => s.goTo);
  const openSheet = useViewStore((s) => s.openSheet);
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  const storeFilter = useViewStore((s) => s.storeFilter);
  const setStoreFilter = useViewStore((s) => s.setStoreFilter);
  const weekStart = useViewStore((s) => s.weekStart);
  const setWeekStart = useViewStore((s) => s.setWeekStart);
  const dayPick = useViewStore((s) => s.dayPick);
  const setDayPick = useViewStore((s) => s.setDayPick);
  const setPrintTarget = useViewStore((s) => s.setPrintTarget);
  const navigate = useNavigate();
  const pendingScroll = useViewStore((s) => s.pendingScroll);
  const consumePendingScroll = useViewStore((s) => s.consumePendingScroll);

  useShortcuts();
  const days = daysInMonth(doc.year, doc.month);
  const today = todayParts();
  const inMonth = today.year === doc.year && today.month === doc.month;
  const short = useMemo(() => shortNames(doc.people), [doc.people]);
  const pharmacists = useMemo(() => doc.people.filter((p) => isRphRole(p.role)), [doc.people]);

  const filterKnown = ["all", "problems", ...statesInUse(doc)].includes(storeFilter) ? storeFilter : "all";
  const visibleStores = useMemo(() => filterStores(doc, ev, filterKnown), [doc, ev, filterKnown]);
  // A store tab that is gone or filtered out falls back to all.
  const { current: onIssueStep } = useIssueNav();
  const onIssue = useMemo(() => new Set(onIssueStep ? [onIssueStep.store, ...onIssueStep.stores] : []), [onIssueStep]);
  const tab = storeTab === "all" || visibleStores.some((s) => s.code === storeTab) ? storeTab : "all";

  const calendars: CalendarStore[] = useMemo(
    () =>
      doc.stores.map((store) => {
        const views: CalendarStore["views"] = {};
        let doubles = 0;
        let licence = 0;
        for (let d = 1; d <= days; d++) {
          views[d] = dayView(doc, ev, store.code, d);
          doubles += views[d]!.names.filter((n) => n.double).length;
          licence += views[d]!.names.filter((n) => n.unlicensed).length;
        }
        return {
          store,
          views,
          holes: ev.storeHoles[store.code] ?? 0,
          leftovers: ev.storeClosed[store.code] ?? 0,
          doubles,
          licence,
        };
      }),
    [doc, ev, days],
  );
  const visibleCalendars = calendars.filter((c) => visibleStores.some((s) => s.code === c.store.code));
  const shown = tab === "all" ? visibleCalendars : visibleCalendars.filter((c) => c.store.code === tab);
  const shownStores = shown.map((c) => c.store);

  // Land on a cell after a jump from a dashboard row, a problem, or another page.
  useEffect(() => {
    if (!pendingScroll || !focus) return;
    const el = document.getElementById(dayDomId(focus.store, focus.day));
    if (!el) return;
    consumePendingScroll();
    el.scrollIntoView({ block: "center", behavior: "auto" });
    // Keyboard focus follows the jump, unless the day sheet is about to take it.
    if (!useViewStore.getState().sheet) el.focus({ preventScroll: true });
  }, [pendingScroll, focus, tab, consumePendingScroll]);

  function jumpToday() {
    const store =
      tab !== "all"
        ? tab
        : (calendars.find((c) => c.views[today.day]?.open)?.store.code ?? doc.stores[0]?.code ?? "");
    if (store) goTo({ store, slot: "pharmacist", day: today.day }, false);
  }

  function pickPerson(name: string) {
    setPerson(name);
    if (!name) return;
    const target = nextNamed(doc, name, null);
    if (target) goTo(target, false);
  }

  function nextPerson() {
    const target = nextNamed(doc, person, focus);
    if (target) goTo(target, false);
  }

  function printStore(code: string) {
    setPrintTarget({ kind: "store", id: code });
    void navigate({ to: "/print" });
  }
  function printPerson() {
    setPrintTarget({ kind: "person", id: person });
    void navigate({ to: "/print" });
  }

  const next = nextYearMonth(doc.year, doc.month);
  const daysLeft = inMonth ? days - today.day : null;
  const monthOver = today.year * 100 + today.month > doc.year * 100 + doc.month;
  const showStartPrompt = monthOver || (daysLeft != null && daysLeft <= 6);

  const placements = person ? namePlacements(doc, person).length : 0;
  const holeGroups = groupHolesByDay(doc, lastNewHoles);
  const aftermath = lastDrops.length > 0 || lastNewHoles.length > 0;

  return (
    <section aria-label="Month" className="flex min-w-0 flex-col gap-3">
      {showStartPrompt ? (
        <div className="flex">
          <StartNextMonthButton label={`Start ${monthName(next.year, next.month)}`} />
        </div>
      ) : null}

      {mode === "calendars" ? <PlaceBar part="bar" /> : null}

      <nav aria-label="Where you are" className="hidden flex-wrap sm:flex items-center gap-x-1 text-sm">
        <button type="button" onClick={() => void navigate({ to: "/" })} className="inline-flex min-h-11 items-center rounded-md px-1 font-medium underline underline-offset-4">
          District
        </button>
        <ChevronRight aria-hidden className="size-4 text-muted" />
        <button
          type="button"
          aria-current={tab === "all" && mode === "calendars" ? "page" : undefined}
          onClick={() => {
            setStoreTab("all");
            setMode("calendars");
          }}
          className={cn("inline-flex min-h-11 items-center rounded-md px-1", tab === "all" && mode === "calendars" ? "font-semibold" : "font-medium underline underline-offset-4")}
        >
          {tab === "all" ? "All stores" : "Stores"}
        </button>
        {tab !== "all" ? (
          <>
            <ChevronRight aria-hidden className="size-4 text-muted" />
            <button
              type="button"
              aria-current={mode === "calendars" ? "page" : undefined}
              onClick={() => setMode("calendars")}
              className={cn("inline-flex min-h-11 items-center rounded-md px-1", mode === "calendars" ? "font-semibold" : "font-medium underline underline-offset-4")}
            >
              {tag(tab)}
            </button>
          </>
        ) : null}
        {mode !== "calendars" ? (
          <>
            <ChevronRight aria-hidden className="size-4 text-muted" />
            <span aria-current="page" className="inline-flex min-h-11 items-center px-1 font-semibold">
              {mode === "day" ? `${weekdayShort(doc.year, doc.month, Math.min(Math.max(dayPick, 1), days))} ${Math.min(Math.max(dayPick, 1), days)}` : "Week"}
            </span>
          </>
        ) : null}
      </nav>

      <div className="grid w-full grid-cols-3 gap-1 surface p-1 sm:inline-grid sm:w-fit sm:min-w-[22rem]" role="group" aria-label="View">
        {(
          [
            ["calendars", "Calendars"],
            ["week", "Week"],
            ["day", "Day"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              if (m === "week" && focus) setWeekStart(focus.day);
              if (m === "day" && focus) setDayPick(focus.day);
              setMode(m);
            }}
            className={cn(
              "h-11 rounded-lg text-sm font-medium",
              mode === m ? "bg-ink text-cream" : "text-ink hover:bg-paper",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={chipRow}
        onScroll={updateFade}
        className={cn("flex gap-1", visibleCalendars.length > 6 ? "-mx-1 -mt-1 overflow-x-auto px-1 pt-1 pb-1 contain-paint" : "flex-wrap", moreRight && "[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]")}
        role="group"
        aria-label="Show store"
      >
        <Chip active={tab === "all"} onClick={() => setStoreTab("all")}>
          All
        </Chip>
        {visibleCalendars.map((c) => {
          const n = c.holes + c.doubles + c.leftovers + c.licence;
          return (
            <Chip key={c.store.code} code={c.store.code} current={onIssue.has(c.store.code)} active={tab === c.store.code} onClick={() => setStoreTab(c.store.code)}>
              {tag(c.store.code)}
              {n ? (
                <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-illegal px-1 text-xs leading-5 font-bold text-cream">
                  {n}
                  <span className="sr-only"> to fix</span>
                </span>
              ) : null}
            </Chip>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {inMonth ? (
          <Button type="button" variant="secondary" size="sm" onClick={jumpToday}>
            Today
          </Button>
        ) : null}
        <NativeSelect
          quiet
          aria-label="Person"
          className="order-first basis-full sm:order-none sm:basis-auto sm:w-52 sm:flex-none"
          value={person}
          onChange={(e) => pickPerson(e.target.value)}
        >
          <option value="">Everyone</option>
          {pharmacists.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          quiet
          aria-label="Stores shown"
          className="hidden min-w-[8.5rem] flex-1 sm:block sm:w-48 sm:flex-none"
          value={filterKnown}
          onChange={(e) => setStoreFilter(e.target.value)}
        >
          <option value="all">All stores ({doc.stores.length})</option>
          <option value="problems">Only stores with problems</option>
          {statesInUse(doc).map((code) => (
            <option key={code} value={code}>
              {stateName(code)} ({doc.stores.filter((st) => stateOfStore(st) === code).length})
            </option>
          ))}
        </NativeSelect>
        {person ? (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={nextPerson} disabled={!placements}>
              Next {person.split(" ")[0]} · {placements}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={printPerson}>
              Print calendar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPerson("")}>
              Show everyone
            </Button>
          </>
        ) : null}
        {mode === "calendars" ? <PlaceBar part="button" /> : null}
        <div className="hidden flex-1 sm:block" />
        <MonthTools />
      </div>

      {aftermath ? (
        <div className={cn("rounded-xl px-3 py-3 text-sm", lastNewHoles.length ? "bg-illegal-bg" : "bg-why")}>
          <div className="flex items-start justify-between gap-3">
            <p className={cn("font-semibold", lastNewHoles.length && "text-illegal")}>
              After starting {monthName(doc.year, doc.month)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                dismissDrops();
                dismissNewHoles();
              }}
            >
              Dismiss
            </Button>
          </div>
          {lastDrops.length ? (
            <div className="mt-2">
              <p className="text-xs font-semibold text-muted">Names not carried over · {lastDrops.length}</p>
              <ul className="mt-1 max-h-32 list-disc space-y-1 overflow-auto pl-5 text-xs">
                {lastDrops.map((d) => (
                  <li key={dropLine(d)}>{dropLine(d)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {lastNewHoles.length ? (
            <div className="mt-2">
              <p className="text-xs font-semibold text-illegal">
                New days with no coverage · {lastNewHoles.length} (no one is added automatically)
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {holeGroups.map((group) => (
                  <li key={group.day} className="flex flex-wrap items-center gap-x-1">
                    <span>{group.heading} ·</span>
                    {group.stores.map((store) => (
                      <button
                        key={store.code}
                        type="button"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 font-medium text-ink underline"
                        onClick={() => goTo({ store: store.code, slot: store.slot, day: group.day }, true)}
                      >
                        {store.name}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "week" ? (
        <WeekBoard
          doc={doc}
          ev={ev}
          stores={shownStores}
          weekStart={weekStart}
          onWeek={setWeekStart}
          person={person}
          today={inMonth ? today.day : null}
          onOpen={(store, day) => openSheet(store, day)}
        />
      ) : mode === "day" ? (
        <DayBoard
          doc={doc}
          ev={ev}
          stores={shownStores}
          day={Math.min(Math.max(dayPick, 1), days)}
          onDay={setDayPick}
          person={person}
          onOpen={(store, day) => openSheet(store, day)}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,25rem),1fr))] gap-3">
          {shown.map((c) => (
            <StoreCalendar
              key={c.store.code}
              data={c}
              year={doc.year}
              month={doc.month}
              today={inMonth ? today.day : null}
              focusDay={focus?.store === c.store.code ? focus.day : null}
              person={person}
              short={short}
              onOpen={(store, day, seed) => openSheet(store, day, "pharmacist", seed ?? "")}
              onPrint={printStore}
              collapsible={shown.length > 1}
              onFocusDay={(store, day) => {
                if (!(focus?.store === store && focus.day === day)) useViewStore.getState().setFocus({ store, slot: "pharmacist", day });
              }}
            />
          ))}
          {shown.length === 0 ? <p className="px-2 py-6 text-sm text-muted">No stores match this filter.</p> : null}
        </div>
      )}

      <MarkLegend />
      <DaySheet />
      <ShortcutsHelp />
    </section>
  );
}

function Chip({ active, onClick, children, code, current }: { active: boolean; onClick: () => void; children: React.ReactNode; code?: string; current?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-store-chip={code}
      data-current-issue={current ? "" : undefined}
      aria-description={current ? "The issue you are on is at this store" : undefined}
      className={cn(
        "inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-medium",
        active ? "bg-ink text-cream shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]" : "bg-cream text-ink ring-1 ring-edge hover:bg-paper",
        // The issue the header arrows are on: a box round its store, the same mark as its cell on the grid.
        current && "outline-2 outline-offset-2 outline-ink outline-solid",
      )}
    >
      {children}
    </button>
  );
}
