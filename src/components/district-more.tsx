import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { AcceptedList } from "@/components/accepted-list";
import { checklistStartsOpen, MonthChecklist, useChecklist } from "@/components/month-checklist";
import { closuresInMonth } from "@/lib/schedule/closure";
import { monthStatus } from "@/lib/schedule/dashboard";
import { monthName, todayParts, weekdayShort } from "@/lib/schedule/calendar";
import { thinCoverDays } from "@/lib/schedule/thin";
import { secondLook } from "@/lib/schedule/second-look";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

/** Everything that is not on the grid, folded behind one control with no label. */
export function DistrictMore() {
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const goTo = useViewStore((s) => s.goTo);
  const navigate = useNavigate();
  const today = todayParts();
  const inMonth = today.year === doc.year && today.month === doc.month;
  const status = useMemo(() => monthStatus(doc, ev), [doc, ev]);
  const looks = useMemo(() => secondLook(doc, inMonth ? today.day : 1), [doc, inMonth, today.day]);
  const decisions = ev.accepted + closuresInMonth(doc).length;
  const waiting = doc.timeOff.filter((t) => t.status === "requested").length;
  const noHome = doc.people.filter((x) => !x.home || x.home === "—" || !doc.stores.some((st) => st.code === x.home)).length;
  const checklist = useChecklist({ doc, steps: status.steps, holes: ev.holes, waiting, noHome });
  const finished = checklist.doneCount === checklist.list.length;
  const [open, setOpen] = useState(() => checklistStartsOpen(doc, finished));

  // Days with no spare pharmacist are one line, not a sentence per day and state: the bar over each day shows the detail.
  const thinDays = useMemo(() => [...new Set(thinCoverDays(doc, inMonth ? today.day : 1).map((t) => t.day))].sort((a, b) => a - b), [doc, inMonth, today.day]);
  const thinFirst = looks.find((c) => c.key.startsWith("t|") || c.key.startsWith("tw|"));
  const others = looks.filter((c) => !(c.key.startsWith("t|") || c.key.startsWith("tw|")));
  const nextStep = checklist.next >= 0 ? checklist.list[checklist.next]! : null;
  const label = `${monthName(doc.year, doc.month)} checklist`;

  return (
    <details className="group" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-2 text-left hover:bg-paper [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-sm text-muted">
            {" · "}
            {checklist.doneCount} of {checklist.list.length} done
            {finished ? ". This month is finished." : nextStep ? `. Next: ${nextStep.label.toLowerCase()}` : ""}
          </span>
        </span>
        {thinDays.length ? <span data-tip={`${thinDays.length} ${thinDays.length === 1 ? "day" : "days"} with nobody spare | See the bar over each day`} className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-bold text-warn">{thinDays.length} thin</span> : null}
      </summary>
      <div className="mt-2 grid gap-4 lg:grid-cols-2">
        <MonthChecklist doc={doc} checklist={checklist} />
        <div className="flex flex-col gap-4">
          {decisions > 0 ? (
            <section aria-label="Left as is" className="surface p-3 sm:p-4">
              <AcceptedList />
            </section>
          ) : null}
          {thinDays.length || others.length ? (
            <section aria-label="Worth a look" className="surface p-3 sm:p-4">
              <ul className="flex flex-col gap-0.5">
                {thinDays.length && thinFirst ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        if (thinFirst.ref) goTo(thinFirst.ref, true);
                        void navigate({ to: "/schedule", resetScroll: false });
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-sm text-warn hover:bg-paper"
                    >
                      <span className="min-w-0 flex-1 text-pretty">
                        <span className="font-semibold">{thinDays.length} {thinDays.length === 1 ? "day" : "days"} with nobody spare:</span>{" "}
                        {thinDays.slice(0, 6).map((d) => `${weekdayShort(doc.year, doc.month, d)} ${d}`).join(", ")}
                        {thinDays.length > 6 ? ` +${thinDays.length - 6}` : ""}
                        <span className="block text-xs text-muted">One more absence on those days leaves a store with no coverage.</span>
                      </span>
                      <ChevronRight aria-hidden className="size-4 shrink-0" />
                    </button>
                  </li>
                ) : null}
                {others.slice(0, 8).map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => {
                        if (c.ref) goTo(c.ref, true);
                        void navigate({ to: c.ref ? "/schedule" : c.page!, resetScroll: c.ref ? false : undefined });
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-sm text-warn hover:bg-paper"
                    >
                      <span className="min-w-0 flex-1 text-pretty">{c.text}</span>
                      <ChevronRight aria-hidden className="size-4 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </details>
  );
}
