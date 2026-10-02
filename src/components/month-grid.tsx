import { useEffect, useMemo, useRef, useState } from "react";
import { issueCells, useIssueNav } from "@/components/issue-nav";
import { useNote } from "@/components/hover-note";
import { MARK_ORDER, StateMark, type AlarmKind } from "@/components/marks";
import { useStoreTag } from "@/components/use-store-tag";
import { weekdayShort, weekdaySun0, monthName, todayParts } from "@/lib/schedule/calendar";
import { choicesFor, offerable } from "@/lib/schedule/dashboard";
import { districtModel, type DayTone } from "@/lib/schedule/district";
import { getCell } from "@/lib/schedule/grid";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import { dayPressure } from "@/lib/schedule/insight";
import type { ScheduleDoc } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { PROBLEM_NAME } from "@/lib/schedule/problem-kinds";

const STATE_NAME: Record<DayTone, string> = {
  ok: "Covered",
  cover: "Covered by a float",
  away: "Covered from another store",
  off: "On time off, still scheduled",
  hole: PROBLEM_NAME.hole,
  accepted: "Left as is",
  double: PROBLEM_NAME.double,
  license: PROBLEM_NAME.license,
  leftover: PROBLEM_NAME.leftover,
  closed: "Closed",
};

const ALARM: Partial<Record<DayTone, AlarmKind>> = { hole: "hole", double: "double", leftover: "leftover", license: "license" };

const first = (n: string) => n.split(" ")[0] ?? n;

/** What is true about one store-day, as the lines of its hover note. No advice, only facts. */
/** `brief` stops after who is scheduled: the free and would-break lines scan every pharmacist, so only hover note builders ask for them. */
function cellLines(doc: ScheduleDoc, store: string, day: number, tone: DayTone, brief = false): string[] {
  const s = doc.stores.find((x) => x.code === store);
  const nameOf = (code: string) => doc.stores.find((x) => x.code === code)?.name.replace(/ (Hi-School )?Pharmacy$/i, "") ?? code;
  const lines = [`${nameOf(store)} · ${weekdayShort(doc.year, doc.month, day)} ${monthName(doc.year, doc.month).slice(0, 3)} ${day} · ${STATE_NAME[tone]}`];
  if (!s || tone === "closed") return lines;
  const names = RPH_SLOTS.map((slot) => getCell(doc.grid, store, slot, day).trim()).filter(Boolean);
  lines.push(names.length ? names.join(" + ") : "Nobody scheduled");
  for (const n of names) {
    const also = doc.stores.filter((o) => o.code !== store && RPH_SLOTS.some((slot) => getCell(doc.grid, o.code, slot, day).trim() === n)).map((o) => nameOf(o.code));
    if (also.length) lines.push(`${first(n)} is also at ${also.join(", ")}`);
  }
  if (brief) return lines;
  if (tone === "ok" || tone === "off" || tone === "cover" || tone === "away" || tone === "accepted") {
    if (tone === "off") lines.push("On time off that day");
    return lines;
  }
  const picks = choicesFor(doc, store, day).filter((c) => !c.here);
  const free = picks.filter((c) => c.state === "free" && offerable(c)).map((c) => c.name);
  lines.push(free.length ? `Free: ${free.slice(0, 6).join(", ")}${free.length > 6 ? ` +${free.length - 6}` : ""}` : "Nobody is free");
  const breaks = picks
    .filter((c) => c.state !== "free" || !offerable(c))
    .slice(0, 3)
    .map((c) => `${first(c.name)}: ${c.state === "double" ? `at ${c.elsewhere.map(nameOf).join(", ")}` : c.state === "off" ? "on time off" : c.state === "dayoff" ? "usual day off" : `not licensed${c.lacksLicence ? ` in ${c.lacksLicence}` : ""}`}`);
  if (breaks.length) lines.push(`Would break: ${breaks.join(" · ")}`);
  return lines;
}

const SLOTS = 4;

/**
 * Spare people that day, as a column of four slots. Each filled slot is one pharmacist who could still be placed, so one,
 * two and three-or-more read at a glance: green slots are spare, one amber slot is "nobody spare", red slots are how many
 * short the day is. A closed day is hatched.
 */
function PressureBar({ p }: { p: { level: string; spare: number } }) {
  if (p.level === "closed") return <span aria-hidden className="h-6 w-full rounded-[3px] bg-[repeating-linear-gradient(135deg,rgba(0,0,0,0.14)_0_2px,transparent_2px_4px)]" />;
  const filled = p.level === "none" ? Math.min(SLOTS, Math.max(1, -p.spare)) : p.level === "tight" ? 1 : Math.min(SLOTS, p.spare);
  const tone = p.level === "none" ? "bg-illegal" : p.level === "tight" ? "bg-warn" : "bg-ok/75";
  return (
    <span aria-hidden className="flex h-6 w-full flex-col-reverse gap-px">
      {Array.from({ length: SLOTS }, (_, i) => (
        <span key={i} className={cn("w-full flex-1 rounded-[2px]", i < filled ? tone : "bg-black/[0.07]")} />
      ))}
    </span>
  );
}

/** One store-day cell: a calm ground, with a mark on it only when something is worth seeing. */
function Cell({ tone }: { tone: DayTone }) {
  const alarm = ALARM[tone];
  if (alarm) {
    return (
      <span className="grid h-[24px] place-items-center rounded-[3px] bg-black/[0.05]">
        <StateMark kind={alarm} size={24} tip={false} />
      </span>
    );
  }
  if (tone === "closed") return <span className="block h-[24px] rounded-[3px] bg-black/[0.06]" />;
  if (tone === "accepted") {
    return (
      <span className="grid h-[24px] place-items-center rounded-[3px] bg-black/[0.05]">
        <StateMark kind="asis" size={24} tip={false} />
      </span>
    );
  }
  return (
    <span className="grid h-[24px] place-items-center rounded-[3px] bg-ok/25">
      {tone === "off" ? <StateMark kind="timeOff" size={24} tip={false} /> : tone === "cover" || tone === "away" ? <StateMark kind="covering" size={24} tip={false} /> : null}
    </span>
  );
}

/**
 * The month, one cell per store-day, and nothing else. Pointing at a cell (or focusing it, or tapping it once on a phone)
 * shows who, where and who is free; clicking it (or tapping it a second time) opens the day.
 */
export function MonthGrid({ onOpen }: { onOpen: (store: string, day: number) => void }) {
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const tag = useStoreTag();
  const today = todayParts();
  const inMonth = today.year === doc.year && today.month === doc.month;
  // `today` is a new object every render, so its three numbers are the real dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => districtModel(doc, ev, today), [doc, ev, today.year, today.month, today.day]);
  // Only what pressure reads: a note or a store address edit does not redo 31 days of lookups.
  const pressure = useMemo(() => dayPressure(doc), [doc.grid, doc.people, doc.stores, doc.timeOff, doc.holidays, doc.pattern, doc.year, doc.month]); // eslint-disable-line react-hooks/exhaustive-deps
  const { show, hide, card } = useNote();
  const [cursor, setCursor] = useState({ r: 0, c: 0 });
  const [pick, setPick] = useState<{ store: string; day: number } | null>(null);
  // The issue the header arrows are on gets a soft outline, on every store it involves.
  const { current } = useIssueNav();
  const marked = new Set(current ? issueCells(current).map((c) => `${c.store}|${c.day}`) : []);
  const touch = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = () => {
    const el = root.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  const days = model.days;
  const rows = model.strip;

  function lines(r: number, c: number) {
    const row = rows[r]!;
    return cellLines(doc, row.code, c + 1, row.tones[c]!);
  }
  function showFor(el: HTMLElement, r: number, c: number) {
    const b = el.getBoundingClientRect();
    const tone = rows[r]!.tones[c]!;
    // The note leads with the cell's own mark, and its edge says problem, off, covered or closed.
    const alarm = ALARM[tone];
    show(b.left + b.width / 2, b.top, lines(r, c), {
      tone: alarm ? "bad" : tone === "off" ? "off" : tone === "ok" || tone === "cover" || tone === "away" ? "ok" : "plain",
      mark: alarm ? { kind: alarm } : tone === "off" ? { kind: "timeOff" } : tone === "cover" || tone === "away" ? { kind: "covering" } : tone === "accepted" ? { kind: "asis" } : null,
    });
  }
  function focusCell(r: number, c: number) {
    const rr = Math.min(Math.max(r, 0), rows.length - 1);
    const cc = Math.min(Math.max(c, 0), days - 1);
    setCursor({ r: rr, c: cc });
    root.current?.querySelector<HTMLElement>(`[data-rc="${rr}|${cc}"]`)?.focus();
  }
  function onKey(e: React.KeyboardEvent, r: number, c: number) {
    const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const m = move[e.key];
    if (m) {
      e.preventDefault();
      focusCell(r + m[0], c + m[1]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(rows[r]!.code, c + 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusCell(r, 0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusCell(r, days - 1);
    }
  }

  return (
    <div className="relative">
    <div ref={root} className="overflow-x-auto" onPointerLeave={hide} onScroll={() => { hide(); measure(); }}>
      <div role="grid" aria-label={`${monthName(doc.year, doc.month)}, every store by day`} className="grid min-w-[34rem] gap-y-[3px]" style={{ gridTemplateColumns: `3rem repeat(${days}, minmax(0, 1fr))`, columnGap: 2 }}>
        <div role="row" className="contents">
        <span role="presentation" />
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const dow = weekdaySun0(doc.year, doc.month, d);
          const isToday = inMonth && today.day === d;
          const pr = pressure[i]!;
          const tip =
            pr.level === "closed"
              ? "Every store is closed"
              : pr.level === "none"
                ? `${-pr.spare} short | ${pr.holes} empty ${pr.holes === 1 ? "shift" : "shifts"}, only ${pr.free} ${pr.free === 1 ? "pharmacist" : "pharmacists"} free`
                : pr.level === "tight"
                  ? `Nobody spare | ${pr.holes} empty ${pr.holes === 1 ? "shift" : "shifts"}, ${pr.free} ${pr.free === 1 ? "pharmacist" : "pharmacists"} free`
                  : `${pr.spare} spare ${pr.spare === 1 ? "pharmacist" : "pharmacists"} | ${pr.free} free, ${pr.holes} empty ${pr.holes === 1 ? "shift" : "shifts"}`;
          return (
            <span
              key={d}
              role="columnheader"
              data-col-day={d}
              data-tip={`${weekdayShort(doc.year, doc.month, d)} ${monthName(doc.year, doc.month).slice(0, 3)} ${d} | ${tip}`}
              className={cn("flex flex-col items-center gap-0.5 pb-1 text-[11px] leading-none tabular-nums", "text-muted")}
            >
              <span aria-hidden>{["S", "M", "T", "W", "T", "F", "S"][dow]}</span>
              <span data-col-date className={cn("rounded-sm px-0.5", isToday && "bg-ink font-bold text-cream")}>{d}</span>
              <PressureBar p={pr} />
            </span>
          );
        })}
        </div>
        {rows.map((row, r) => (
          <div key={row.code} role="row" className="contents">
            <span role="rowheader" data-tip={row.name} className="pr-1 text-xs leading-[24px] font-bold text-ink/80">
              {tag(row.code)}
            </span>
            {row.tones.map((tone, c) => {
              const selected = pick?.store === row.code && pick.day === c + 1;
              const onIssue = marked.has(`${row.code}|${c + 1}`);
              return (
                <button
                  key={c}
                  type="button"
                  role="gridcell"
                  data-notip
                  data-rc={`${r}|${c}`}
                  data-cell={`${row.code}|${c + 1}`}
                  data-issue={onIssue || undefined}
                  data-tone={tone}
                  tabIndex={cursor.r === r && cursor.c === c ? 0 : -1}
                  aria-label={cellLines(doc, row.code, c + 1, tone, true).slice(0, 2).join(". ")}
                  onPointerDown={(e) => (touch.current = e.pointerType === "touch")}
                  onPointerEnter={(e) => e.pointerType !== "touch" && showFor(e.currentTarget, r, c)}
                  onFocus={(e) => {
                    setCursor({ r, c });
                    if (e.currentTarget.matches(":focus-visible")) showFor(e.currentTarget, r, c);
                  }}
                  onBlur={hide}
                  onKeyDown={(e) => onKey(e, r, c)}
                  onClick={(e) => {
                    if (touch.current && !selected) {
                      setPick({ store: row.code, day: c + 1 });
                      showFor(e.currentTarget, r, c);
                      return;
                    }
                    setPick(null);
                    hide();
                    onOpen(row.code, c + 1);
                  }}
                  className={cn("block rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ink", selected && "ring-2 ring-ink", onIssue && !selected && "ring-2 ring-ink/70 ring-offset-2 ring-offset-white")}
                >
                  <Cell tone={tone} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {card}
    </div>
    {more ? (
      <span aria-hidden data-tip="More days: scroll sideways" className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-gradient-to-l from-white via-white/80 to-transparent pr-1 sm:hidden">
        <span className="grid size-7 place-items-center rounded-full bg-ink text-cream shadow-md">›</span>
      </span>
    ) : null}
    </div>
  );
}

/** The marks and nothing else, from the same list the guide uses. Pointing at one names it. */
export function MarkLegend({ className }: { className?: string }) {
  return (
    <ul aria-label="Marks" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      {MARK_ORDER.map((k) => (
        <li key={k}>
          <StateMark kind={k} size={24} />
        </li>
      ))}
      <li data-tip="Closed | The store is shut that day" className="size-6 rounded-[7px] bg-black/[0.06]" />
      <li data-tip="Covered | Every open shift has a pharmacist" className="size-6 rounded-[7px] bg-ok/25" />
      <li data-tip="Bar over a day | One slot per spare pharmacist. Green: 1 to 4 who could still be placed. One amber slot: nobody spare. Red: that many short" className="flex h-6 items-end gap-1.5">
        {[{ n: 1, c: "bg-ok/75" }, { n: 3, c: "bg-ok/75" }, { n: 1, c: "bg-warn" }, { n: 2, c: "bg-illegal" }].map((b, k) => (
          <span key={k} className="flex h-6 w-1.5 flex-col-reverse gap-px">
            {Array.from({ length: SLOTS }, (_, i) => (
              <span key={i} className={cn("w-full flex-1 rounded-[1px]", i < b.n ? b.c : "bg-black/[0.07]")} />
            ))}
          </span>
        ))}
      </li>
    </ul>
  );
}
