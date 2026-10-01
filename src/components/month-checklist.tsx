import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { readPrinted } from "@/components/print-extras";
import { monthKey } from "@/lib/schedule/archive";
import { monthName } from "@/lib/schedule/calendar";
import type { FixStep } from "@/lib/schedule/fix";
import type { ScheduleDoc } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

type Step = { id: string; label: string; detail: string; to: "/people" | "/holidays" | "/time-off" | "/schedule" | "/print"; done: boolean; manual?: boolean };

const KEY = "hischool-checklist-v1";
const SEEN = "hischool-checklist-seen-v1";

function readAck(ym: string): string[] {
  try {
    return ((JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string[]>)[ym] ?? []) as string[];
  } catch {
    return [];
  }
}

function writeAck(ym: string, ids: string[]) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string[]>;
    all[ym] = ids;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* the list still works for this visit */
  }
}

/**
 * The monthly routine as five steps, in the order the work goes. Three tick themselves from the data (requests decided,
 * everything covered and fixed, pack printed); two are "I checked" (people and holidays), because the app can't know
 * they're right. Each step says how much is left, not just whether it is done.
 */
export function useChecklist({ doc, steps, holes, waiting, noHome }: { doc: ScheduleDoc; steps: FixStep[]; holes: number; waiting: number; noHome: number }) {
  const ym = monthKey(doc.year, doc.month);
  const [ack, setAck] = useState<string[]>(() => readAck(ym));
  const printed = readPrinted(ym) != null;
  const monthHolidays = doc.holidays.filter((h) => h.date.slice(5, 7) === String(doc.month).padStart(2, "0")).length;
  const list: Step[] = [
    { id: "people", label: "People and stores are up to date", detail: noHome ? `${noHome} with no home store` : `${doc.people.length} pharmacists, ${doc.stores.length} stores`, to: "/people", done: noHome === 0 && ack.includes("people"), manual: true },
    { id: "holidays", label: "Holidays and closures are right", detail: monthHolidays ? `${monthHolidays} this month` : "None this month", to: "/holidays", done: ack.includes("holidays"), manual: true },
    { id: "timeoff", label: "Time-off requests are decided", detail: waiting ? `${waiting} waiting` : "None waiting", to: "/time-off", done: waiting === 0 },
    { id: "fix", label: "Every open day is covered and problems are fixed or left as is", detail: steps.length ? `${steps.length} to fix${holes ? `, ${holes} with no coverage` : ""}` : "All covered, nothing to fix", to: "/schedule", done: steps.length === 0 && holes === 0 },
    { id: "print", label: "Pack is printed", detail: printed ? "Printed or saved" : "Not yet", to: "/print", done: printed },
  ];
  const doneCount = list.filter((x) => x.done).length;
  const next = list.findIndex((x) => !x.done);
  function toggleAck(id: string) {
    const nextAck = ack.includes(id) ? ack.filter((x) => x !== id) : [...ack, id];
    setAck(nextAck);
    writeAck(ym, nextAck);
  }
  return { list, doneCount, next, ack, toggleAck };
}

/** Whether the checklist should start open: the first time this month is seen, and only while it is unfinished. */
export function checklistStartsOpen(doc: ScheduleDoc, finished: boolean): boolean {
  if (finished) return false;
  const ym = monthKey(doc.year, doc.month);
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN) ?? "{}") as Record<string, boolean>;
    if (seen[ym]) return false;
    seen[ym] = true;
    localStorage.setItem(SEEN, JSON.stringify(seen));
  } catch {
    /* stays open this visit */
  }
  return true;
}

/** The routine as a path (a hexagon per step, joined by a line) and a list under it. The summary line above it says how far along it is. */
export function MonthChecklist({ doc, checklist }: { doc: ScheduleDoc; checklist: ReturnType<typeof useChecklist> }) {
  const { list, next, ack, toggleAck } = checklist;
  return (
    <section aria-label={`${monthName(doc.year, doc.month)} checklist`} className="surface p-3 sm:p-4">
      <ol className="flex items-center px-1" aria-label="Steps">
        {list.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center last:flex-none">
            <Link
              to={s.to}
              resetScroll={s.to === "/schedule" ? false : undefined}
              title={`${s.label} | ${s.detail}${s.done ? " | Done" : ""}`}
              aria-label={`${s.done ? "Done: " : "To do: "}${s.label}. ${s.detail}`}
              className="relative grid size-9 shrink-0 place-items-center"
            >
              <svg viewBox="0 0 56 48" aria-hidden className="absolute inset-0 size-full">
                <polygon points="14,0 42,0 56,24 42,48 14,48 0,24" className={cn(s.done ? "fill-ok" : "fill-paper", i === next ? "stroke-ink" : s.done ? "stroke-ok" : "stroke-edge")} strokeWidth={i === next ? 4 : 2.5} strokeLinejoin="round" />
              </svg>
              <span className={cn("relative text-xs font-bold", s.done ? "text-cream" : "text-muted")}>{s.done ? <Check aria-hidden className="size-4" /> : i + 1}</span>
            </Link>
            {i < list.length - 1 ? <span aria-hidden className={cn("mx-1 h-0.5 flex-1 rounded-full", s.done ? "bg-ok" : "bg-line")} /> : null}
          </li>
        ))}
      </ol>

      <ol className="mt-3 flex flex-col border-t border-line pt-1">
        {list.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 border-b border-line/60 last:border-0">
            <Link to={s.to} resetScroll={s.to === "/schedule" ? false : undefined} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left">
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-[7px] text-xs font-bold", s.done ? "bg-ok text-cream" : i === next ? "bg-ink text-cream" : "bg-paper text-muted ring-1 ring-line")}>
                {s.done ? <Check aria-hidden className="size-3.5" /> : i + 1}
                <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", s.done && "text-muted")}>{s.label}</span>
                <span className={cn("block text-xs", s.done ? "text-muted" : "font-semibold text-ink")}>{s.detail}</span>
              </span>
            </Link>
            {s.manual ? (
              <button
                type="button"
                aria-pressed={ack.includes(s.id)}
                aria-label={ack.includes(s.id) ? `Checked: ${s.label}. Tap to uncheck.` : `Mark checked: ${s.label}`}
                title={ack.includes(s.id) ? "Checked. Tap to undo." : "Mark as checked"}
                onClick={() => toggleAck(s.id)}
                className={cn("grid size-11 shrink-0 place-items-center rounded-lg", ack.includes(s.id) ? "bg-ink text-cream" : "bg-cream text-muted ring-1 ring-edge hover:bg-paper")}
              >
                <Check aria-hidden className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
