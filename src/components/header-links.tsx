import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useStoreTag } from "@/components/use-store-tag";
import { monthName, weekdayShort } from "@/lib/schedule/calendar";
import type { FixStep } from "@/lib/schedule/fix";
import { isOpenDay } from "@/lib/schedule/place";
import type { ScheduleDoc } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/store/view-store";

/**
 * The header and the calendars below answer each other on a laptop. Pointing at a tile, a ring day or a store in the day
 * strip lights the matching days on the ring and outlines the matching cells below; pointing at a date below lights its
 * day on the ring. Hover only: nothing is chosen, opened or changed, and nothing is saved.
 */

export function setHover(days: number[], cells: string[] = [], dim = false) {
  useViewStore.getState().setHover({ days, cells, dim });
}
export function clearHover() {
  if (useViewStore.getState().hover) useViewStore.getState().setHover(null);
}

/** Hover handlers for a header element: mouse and pen only, so a tap on a phone never leaves something lit. */
export function hoverProps(days: number[], cells: string[] = [], dim = false) {
  return {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType !== "touch" && setHover(days, cells, dim),
    onPointerLeave: clearHover,
  };
}

/** The cells a list of issues marks below, as "STORE|day". */
export function stepCells(steps: FixStep[]): string[] {
  return [...new Set(steps.flatMap((s) => [s.store, ...s.stores].map((c) => `${c}|${s.day}`)))];
}

const ID = /^day-(.+)-(\d+)$/;

/**
 * Draws the outlines for whatever is lit, on the month grid and on the store calendars, and listens for the pointer over
 * a date below so the ring can answer. Mounted once, with the header.
 */
export function HoverLinks() {
  const hover = useViewStore((s) => s.hover);
  useEffect(() => {
    // A date below: the month grid cell, its column heading, or a day on a store calendar.
    function over(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest || t.closest("section.bg-night")) return;
      const cell = t.closest<HTMLElement>("[data-cell]")?.dataset.cell;
      const col = t.closest<HTMLElement>("[data-col-day]")?.dataset.colDay;
      const idm = t.closest<HTMLElement>("[id^='day-']")?.id.match(ID);
      const day = cell ? Number(cell.split("|")[1]) : col ? Number(col) : idm ? Number(idm[2]) : null;
      const cur = useViewStore.getState().hover;
      if (day == null) {
        if (cur && !cur.dim && cur.cells.length === 0) clearHover();
        return;
      }
      if (cur?.days.length === 1 && cur.days[0] === day && cur.cells.length === 0) return;
      setHover([day]);
    }
    document.addEventListener("pointerover", over);
    return () => document.removeEventListener("pointerover", over);
  }, []);
  if (!hover) return null;
  // Outlines are drawn with a stylesheet so the grid and the calendars don't re-render while the pointer moves.
  const cells = hover.cells
    .map((c) => {
      const [store, day] = c.split("|");
      return `[data-cell="${CSS.escape(c)}"], #${CSS.escape(`day-${store}-${day}`)}`;
    })
    .join(",\n");
  // The date heading of each lit day on the month grid gets a box, so the column reads as the one the ring is on.
  const cols = hover.days.map((d) => `[data-col-day="${d}"] > [data-col-date]`).join(",\n");
  return (
    <style>
      {`${cells ? `${cells} { outline: 2px dashed #201820; outline-offset: 2px; border-radius: 4px; }` : ""}
${cols ? `${cols} { outline: 2px solid #201820; outline-offset: 1px; }` : ""}`}
    </style>
  );
}

/**
 * One line of store tags for the selected day: covered, a problem (boxed), or closed (hollow). Pointing at one outlines
 * its cell below; clicking opens that store's day. Laptop only.
 */
export function DayStrip({ doc, day, steps, current }: { doc: ScheduleDoc; day: number; steps: FixStep[]; current: FixStep | null }) {
  const tag = useStoreTag();
  const goTo = useViewStore((s) => s.goTo);
  const navigate = useNavigate();
  const problem = useMemo(() => new Set(stepCells(steps.filter((s) => s.day === day)).map((c) => c.split("|")[0]!)), [steps, day]);
  const here = new Set(current && current.day === day ? [current.store, ...current.stores] : []);
  const when = `${weekdayShort(doc.year, doc.month, day)} ${monthName(doc.year, doc.month).slice(0, 3)} ${day}`;
  return (
    <ul aria-label={`Stores on ${when}`} data-day-strip={day} className="flex flex-wrap gap-1 max-sm:hidden">
      {doc.stores.map((s) => {
        const open = isOpenDay(doc, s.code, day);
        const bad = problem.has(s.code);
        const state = bad ? "To fix" : open ? "Covered" : "Closed";
        return (
          <li key={s.code}>
            <button
              type="button"
              data-strip-store={s.code}
              data-state={bad ? "bad" : open ? "ok" : "closed"}
              data-tip={`${s.name} | ${when} · ${state} | Open this day`}
              data-tip-tone={bad ? "bad" : open ? "ok" : undefined}
              data-tip-mark={`store:${tag(s.code)}`}
              aria-label={`${s.name}, ${when}: ${state}. Open this day`}
              {...hoverProps([day], [`${s.code}|${day}`])}
              onClick={() => {
                clearHover();
                goTo({ store: s.code, slot: "pharmacist", day }, true);
                void navigate({ to: "/schedule", resetScroll: false });
              }}
              className={cn(
                "h-7 min-w-9 rounded-md px-1.5 text-[11px] leading-none font-bold tabular-nums outline-offset-2 transition-colors",
                bad ? "bg-illegal-bg text-illegal ring-1 ring-illegal-bg hover:bg-white" : open ? "bg-white/12 text-white/85 hover:bg-white/20" : "border border-dashed border-white/30 text-white/40 hover:text-white/70",
                here.has(s.code) && "ring-2 ring-white ring-offset-2 ring-offset-[#201820]",
              )}
            >
              {tag(s.code)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
