import { useMemo, useRef, useState } from "react";
import { AddTimeOffDrawer, type AddSeed } from "@/components/time-off-add";
import { CalendarTab } from "@/components/time-off-calendar";
import { type Tab } from "@/components/time-off-parts";
import { ListTab } from "@/components/time-off-list";
import { RequestsTab } from "@/components/time-off-requests";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/icons";
import { AlarmMark, StateMark } from "@/components/marks";
import { Count, HeroLead, PageStrip } from "@/components/page-strip";
import { MiniMonth } from "@/components/hero-graphics";
import { monthName } from "@/lib/schedule/calendar";
import { TimeOffLanes } from "@/components/time-off-lanes";
import { dayLoads, summarize } from "@/lib/schedule/timeoff-view";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

const TABS: Tab[] = ["requests", "calendar", "list"];

export function TimeOffScreen() {
  const doc = useScheduleStore((s) => s.doc);
  const loads = useMemo(() => dayLoads(doc), [doc]);
  const sum = useMemo(() => summarize(doc, loads), [doc, loads]);
  const saved = useViewStore((s) => s.timeOffTab);
  const setSaved = useViewStore((s) => s.setTimeOffTab);
  const [tab, setTabState] = useState<Tab>(saved ?? (sum.waiting > 0 ? "requests" : "calendar"));
  const [seed, setSeedState] = useState<AddSeed | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const entryCount = doc.timeOff.filter((t) => t.status !== "declined").length;

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

  function setTab(t: Tab) {
    setTabState(t);
    setSaved(t);
  }

  function onTabKey(e: React.KeyboardEvent) {
    const i = TABS.indexOf(tab);
    const next = e.key === "ArrowRight" ? TABS[(i + 1) % 3] : e.key === "ArrowLeft" ? TABS[(i + 2) % 3] : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6">
      <PageStrip
        title="Time off"
        glow="away"
        lead={
          <HeroLead n={sum.waiting} tone="warn" done={!sum.waiting} mark="waiting" tip={sum.waiting ? `To approve · ${sum.waiting} | Requests waiting for a yes or a no` : "Nothing to approve | Every request has been decided"} onClick={sum.waiting ? () => setTab("requests") : undefined} />
        }
        tiles={
          <>
            {sum.uncoveredShifts ? (
              <Count n={sum.uncoveredShifts} tone="bad" tip={`Stores left with no pharmacist · ${sum.uncoveredShifts} | Approved time off that leaves a store bare`}>
                <AlarmMark kind="hole" size={28} tip={false} onDark />
              </Count>
            ) : null}
            {sum.stillScheduled ? (
              <Count n={sum.stillScheduled} tone="warn" tip={`Still scheduled · ${sum.stillScheduled} | Named on a day they are off. Prints in yellow`} onClick={() => setTab("list")}>
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
        graphic={<MiniMonth
            doc={doc}
            onPick={() => setTab("calendar")}
            dotFor={(d) => {
              const l = loads[d - 1];
              const n = (l?.off.length ?? 0) + (l?.pending.length ?? 0);
              const head = `${monthName(doc.year, doc.month).slice(0, 3)} ${d}`;
              if (l?.uncovered.length) return { n: Math.max(n, 1), tone: "bare", lines: [`${head} · ${l.uncovered.length === 1 ? "a store" : `${l.uncovered.length} stores`} left with no pharmacist`, ...l.off.slice(0, 4)] };
              if (n) return { n, tone: "off", lines: [`${head} · ${n} off`, ...l!.off.slice(0, 4), ...(l!.pending.length ? [`${l!.pending.length} waiting for you`] : [])] };
              return { n: 0, tone: "none", lines: [head] };
            }}
          />}
      />

      {tab !== "calendar" ? <TimeOffLanes doc={doc} onPickDay={(d) => { setTab("calendar"); setFocusDay(d); }} /> : null}

      <div role="tablist" aria-label="Time off views" className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]" onKeyDown={onTabKey}>
        {(
          [
            ["requests", "Requests", sum.waiting],
            ["calendar", "Calendar", null],
            ["list", "List", entryCount],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`to-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`to-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold",
              tab === id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
            {n ? <span className={cn("rounded-full px-2 text-xs", id === "requests" ? "bg-warn-bg text-warn" : "bg-paper text-muted")}>{n}</span> : null}
          </button>
        ))}
      </div>

      <div key={tab} role="tabpanel" id={`to-panel-${tab}`} aria-labelledby={`to-tab-${tab}`} tabIndex={-1} className="hs-fade">
        {tab === "requests" ? <RequestsTab /> : null}
        {tab === "calendar" ? <CalendarTab focusDay={focusDay} onFocusDay={setFocusDay} onAdd={setSeed} /> : null}
        {tab === "list" ? <ListTab onEdit={setSeed} /> : null}
      </div>

      <AddTimeOffDrawer key={seed ? JSON.stringify(seed) : "closed"} seed={seed} onClose={() => setSeed(null)} />
    </div>
  );
}
