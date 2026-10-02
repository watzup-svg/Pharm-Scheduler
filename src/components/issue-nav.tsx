import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { dayDomId, shortNames } from "@/components/day-view";
import { HexBadge } from "@/components/graphics";
import { HeroLead } from "@/components/hero";
import { AlarmMark } from "@/components/marks";
import { useStoreTag } from "@/components/use-store-tag";
import { monthName, weekdayShort } from "@/lib/schedule/calendar";
import { monthStatus } from "@/lib/schedule/dashboard";
import { stepRef, type FixStep } from "@/lib/schedule/fix";
import { anchorOf, currentIssue, issueOrder, issueTitle, stepFrom } from "@/lib/schedule/issue-cursor";
import type { ScheduleDoc } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

const ymOf = (doc: ScheduleDoc) => `${doc.year}-${String(doc.month).padStart(2, "0")}`;

/** The cells an issue marks: its store, plus every store a person is at twice. */
export function issueCells(step: FixStep): { store: string; day: number }[] {
  return [...new Set([step.store, ...step.stores])].map((store) => ({ store, day: step.day }));
}

/**
 * The one issue cursor, shared by the header arrows, the month grid, the store calendars and the day panel's Next.
 * Stepping only selects and highlights; it never opens anything and never changes the schedule.
 */
export function useIssueNav() {
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const anchor = useViewStore((s) => s.issue);
  const sheet = useViewStore((s) => s.sheet);
  const ordered = useMemo(() => issueOrder(doc, monthStatus(doc, ev).steps), [doc, ev]);
  const live = anchor && anchor.ym === ymOf(doc) ? anchor : null;
  const current = useMemo(() => currentIssue(doc, ordered, live), [doc, ordered, live]);
  const index = current ? ordered.indexOf(current) : -1;
  /** The day everything else follows: the open day panel, else the issue she is on, else nothing. */
  const selectedDay = sheet?.day ?? current?.day ?? null;
  return { doc, ordered, current, index, count: ordered.length, selectedDay };
}

/** Put the cursor on an issue, outline its cells and bring them into view, without opening anything. */
export function selectIssue(doc: ScheduleDoc, step: FixStep) {
  const view = useViewStore.getState();
  view.setIssue({ ...anchorOf(step), ym: ymOf(doc) });
  // With the day panel already open, it follows the cursor instead of showing a day the header has left.
  if (view.sheet) {
    const ref = stepRef(step);
    view.openSheet(ref.store, ref.day, ref.slot, "", view.sheet.run);
    return;
  }
  view.setFocus(stepRef(step));
  if (view.storeTab !== "all" && view.storeTab !== step.store) view.setStoreTab(step.store);
  if (view.mode === "day") view.setDayPick(step.day);
  // Bring the cell into view sideways (the phone grid scrolls left and right), but never scroll the page: the arrows
  // stay under her thumb so she can keep stepping. The header's leaf and title say where the issue is.
  window.requestAnimationFrame(() => {
    // The store's chip in the Schedule store row, too: it carries the box that says which store this issue is at.
    const chip = document.querySelector<HTMLElement>(`[data-store-chip="${step.store}"]`);
    const row = chip?.closest<HTMLElement>(".overflow-x-auto");
    if (chip && row) {
      const c = chip.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      if (c.left < r.left + 24 || c.right > r.right - 48) row.scrollLeft += c.left + c.width / 2 - (r.left + r.width / 2);
    }
    const el =
      document.querySelector<HTMLElement>(`[data-cell="${step.store}|${step.day}"]`) ?? document.getElementById(dayDomId(step.store, step.day));
    const box = el?.closest<HTMLElement>(".overflow-x-auto");
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.left < b.left + 48 || r.right > b.right - 48) box.scrollLeft += r.left + r.width / 2 - (b.left + b.width / 2);
  });
}

export function clearIssue() {
  useViewStore.getState().setIssue(null);
}

/** Open the full day panel on an issue, the way Fix always has. */
export function useOpenIssue() {
  const goTo = useViewStore((s) => s.goTo);
  const navigate = useNavigate();
  return (doc: ScheduleDoc, step: FixStep) => {
    useViewStore.getState().setIssue({ ...anchorOf(step), ym: ymOf(doc) });
    goTo(stepRef(step), true, "", true);
    void navigate({ to: "/schedule", resetScroll: false });
  };
}

const ARROW = "grid size-11 shrink-0 place-items-center rounded-xl text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-7";

/** ‹ 13 › : the count of issues with an arrow either side. "3 of 13" shows under it while she is stepping. */
export function IssueLead({ tip }: { tip: string }) {
  const { doc, ordered, current, index, count } = useIssueNav();
  const open = useOpenIssue();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const done = count === 0;
  const anchor = current ? anchorOf(current) : null;
  function step(dir: 1 | -1) {
    const next = stepFrom(doc, ordered, anchor, dir);
    if (next) selectIssue(doc, next);
  }
  return (
    <div
      className="relative flex shrink-0 items-center"
      onKeyDown={(e) => {
        if (e.key === "Escape" && current) {
          e.stopPropagation();
          clearIssue();
        }
      }}
      onPointerDown={(e) => {
        swipe.current = e.pointerType === "touch" ? { x: e.clientX, y: e.clientY } : null;
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s || done) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      <button type="button" className={cn(ARROW, "-ml-2")} disabled={done} aria-label="Previous issue" data-tip="Previous issue | Steps back through the month. Nothing changes until you choose" onClick={() => step(-1)}>
        <ChevronLeft aria-hidden />
      </button>
      <HeroLead n={count} tone="bad" done={done} tip={current ? `${issueTitle(doc, current)} | Open this day` : tip} onClick={ordered[0] ? () => open(doc, current ?? ordered[0]!) : undefined} />
      <button type="button" className={ARROW} disabled={done} aria-label="Next issue" data-tip="Next issue | Steps forward through the month. Nothing changes until you choose" onClick={() => step(1)}>
        <ChevronRight aria-hidden />
      </button>
      {current ? (
        <span aria-live="polite" className="pointer-events-none absolute inset-x-0 -bottom-4 text-center text-xs leading-4 font-semibold tabular-nums text-white/70">
          {index + 1} of {count}
        </span>
      ) : null}
    </div>
  );
}

/** The store badge for the issue the cursor is on. The date is in the ring and the title, so there is no calendar leaf. */
export function IssueLeaf({ step }: { step: FixStep }) {
  const { doc } = useIssueNav();
  const open = useOpenIssue();
  const tag = useStoreTag();
  const mon = monthName(doc.year, doc.month).slice(0, 3);
  const wd = weekdayShort(doc.year, doc.month, step.day);
  const store = doc.stores.find((s) => s.code === step.store);
  return (
    <button
      type="button"
      onClick={() => open(doc, step)}
      data-tip={`${store?.name ?? step.store} | ${wd} ${mon} ${step.day} | Open this day`}
      aria-label={`Open ${store?.name ?? step.store}, ${wd} ${mon} ${step.day}`}
      className="relative flex shrink-0 items-center rounded-xl px-1 py-1 outline-offset-2 hover:bg-white/10 max-[359px]:hidden"
    >
      <HexBadge code={tag(step.store)} tone="bad" className="h-12 max-sm:h-10" />
    </button>
  );
}

/** The short title of the issue the cursor is on: its mark, what is wrong and where, and a way to stop stepping. */
export function IssueTitle({ step, className }: { step: FixStep; className?: string }) {
  const { doc } = useIssueNav();
  const open = useOpenIssue();
  const short = useMemo(() => shortNames(doc.people), [doc.people]);
  const title = issueTitle(doc, step, short);
  return (
    <div key={title} className={cn("hs-fade flex min-w-0 items-center gap-2", className)}>
      <AlarmMark kind={step.kind} size={28} tip={false} onDark />
      <button type="button" onClick={() => open(doc, step)} data-tip={`${title} | Open this day`} className="min-w-0 rounded-md text-left text-lg leading-6 font-semibold text-white outline-offset-2 hover:underline max-sm:text-base max-sm:leading-5">
        {/* The date never breaks across lines ("Tue Oct 6" stays together). */}
        <span className="line-clamp-2">{title.replace(/(\w{3}) (\w{3}) (\d+)$/, "$1\u00a0$2\u00a0$3")}</span>
      </button>
      <button type="button" onClick={clearIssue} aria-label="Stop stepping through issues" data-tip="Done | Back to the month at a glance" className="grid size-11 shrink-0 place-items-center rounded-xl text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 [&_svg]:size-5">
        <X aria-hidden />
      </button>
    </div>
  );
}
