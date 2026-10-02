import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Printer } from "lucide-react";
import { useMemo } from "react";
import { confirmAction } from "@/components/confirm";
import { HeroCount, HeroLayout } from "@/components/hero";
import { IssueLead, IssueLeaf, IssueTitle, useIssueNav, useOpenIssue } from "@/components/issue-nav";
import { MonthDial } from "@/components/hero-graphics";
import { Mark } from "@/components/icons";
import { AlarmMark, StateMark, type AlarmKind } from "@/components/marks";
import { acceptedItems } from "@/lib/schedule/accept";
import { NextGapLeaf } from "@/components/next-gap";
import { Button } from "@/components/ui/button";
import { isOpenDay } from "@/lib/schedule/place";
import { getCell } from "@/lib/schedule/grid";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import { monthStatus } from "@/lib/schedule/dashboard";
import { type FixStep } from "@/lib/schedule/fix";
import { issueOrder } from "@/lib/schedule/issue-cursor";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

const KINDS: AlarmKind[] = ["hole", "double", "leftover", "license"];
const KIND_NAME: Record<AlarmKind, string> = { hole: "No coverage", double: "Two places", leftover: "Name on a closed day", license: "Not licensed" };

/** How many grid cells carry this kind of mark: a person at two stores is one problem but marks both stores. */
const marked = (list: FixStep[]) => new Set(list.flatMap((s) => [s.store, ...s.stores].map((c) => `${c}|${s.day}`))).size;

/**
 * The whole summary of the month with no sentences: the count of hard problems, the next gap as a calendar page, a tile per
 * kind, and the month as a ring. Pointing at any mark names it and says who. Dark, with the hexagon texture.
 */
export function StatusStrip({ showPrint = false }: { showPrint?: boolean }) {
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const clearLeftovers = useScheduleStore((s) => s.clearLeftovers);
  const goTo = useViewStore((s) => s.goTo);
  const openSick = useViewStore((s) => s.openSick);
  const setFillOpen = useViewStore((s) => s.setFillOpen);
  const navigate = useNavigate();
  const status = useMemo(() => monthStatus(doc, ev), [doc, ev]);
  const steps = status.steps;
  const accepted = useMemo(() => acceptedItems(doc, ev), [doc, ev]);
  const waiting = doc.timeOff.filter((t) => t.status === "requested").length;
  // Everything in the header walks the month in date order, the same order as the arrows and the day panel's Next.
  const ordered = useMemo(() => issueOrder(doc, steps), [doc, steps]);
  const by = (k: AlarmKind) => ordered.filter((s) => s.kind === k);
  const nav = useIssueNav();
  const openIssue = useOpenIssue();
  const current = nav.current;

  function fix(step: FixStep) {
    openIssue(doc, step);
  }
  function pickDay(day: number) {
    const step = ordered.find((s) => s.day === day);
    if (step) return fix(step);
    const store = doc.stores.find((s) => isOpenDay(doc, s.code, day) && !RPH_SLOTS.some((slot) => getCell(doc.grid, s.code, slot, day).trim())) ?? doc.stores.find((s) => isOpenDay(doc, s.code, day));
    if (store) {
      goTo({ store: store.code, slot: "pharmacist", day }, false);
      void navigate({ to: "/schedule", resetScroll: false });
    }
  }
  async function clearClosed() {
    const list = by("leftover");
    const ok = await confirmAction({
      title: `Remove ${list.length} ${list.length === 1 ? "name" : "names"} from closed days?`,
      body: list.map((s) => s.headline).slice(0, 4).join(" · "),
      effects: ["The days are cleared. You can undo it."],
      confirmLabel: "Remove",
    });
    if (ok) clearLeftovers(list.map((s) => ({ store: s.store, day: s.day })));
  }

  return (
    <HeroLayout
      label="Month status"
      lead={
        <IssueLead
          tip={ordered.length ? `${ordered.length} ${ordered.length === 1 ? "problem" : "problems"} to fix | ${ordered[0]?.headline ?? ""} | The arrows step through them` : "Nothing to fix | Every open store has a pharmacist, nobody is at two stores, no closed day has a name"}
        />
      }
      extra={
        current ? (
          <>
            <IssueLeaf step={current} />
            <IssueTitle step={current} className="max-sm:hidden" />
          </>
        ) : (
          <NextGapLeaf doc={doc} steps={ordered} onOpen={fix} onDark />
        )
      }
      tilesClassName={current ? "max-sm:[&>li:not([data-issue])]:hidden" : undefined}
      tiles={
        <>
          {current ? (
            <li data-issue className="w-full sm:hidden">
              <IssueTitle step={current} />
            </li>
          ) : null}
          {KINDS.map((k) => {
            const list = by(k);
            if (!list.length) return null;
            return (
              <HeroCount
                key={k}
                n={list.length}
                tone="bad"
                tip={`${KIND_NAME[k]} · ${list.length} | ${list[0]!.headline}${marked(list) !== list.length ? ` | ${marked(list)} marks on the grid, one for each store involved` : ""}`}
                onClick={() => fix(list[0]!)}
              >
                <AlarmMark kind={k} size={28} tip={false} onDark />
              </HeroCount>
            );
          })}
          {accepted.length ? (
            <HeroCount
              n={accepted.length}
              tip={`Left as is · ${accepted.length} | Problems you decided to print as they are. ${accepted[0]!.label}`}
              onClick={() => {
                goTo({ store: accepted[0]!.store, slot: "pharmacist", day: accepted[0]!.day }, true);
                void navigate({ to: "/schedule", resetScroll: false });
              }}
            >
              <StateMark kind="asis" size={28} tip={false} />
            </HeroCount>
          ) : null}
          {waiting ? (
            <HeroCount n={waiting} tone="warn" tip={`Time off waiting · ${waiting} | Requests you have not decided`} onClick={() => void navigate({ to: "/time-off" })}>
              <StateMark kind="waiting" size={28} tip={false} />
            </HeroCount>
          ) : null}
        </>
      }
      actions={
        <>
          {ordered[0] ? (
            <Button type="button" variant="light" aria-label={current ? "Open this issue" : "Fix the next one"} onClick={() => fix(current ?? ordered[0]!)}>
              Fix
              <ArrowRight />
            </Button>
          ) : showPrint ? null : (
            <Button type="button" variant="light" aria-label="Open the print pack" onClick={() => void navigate({ to: "/print" })}>
              <Printer />
              Print
            </Button>
          )}
          {by("hole").length ? (
            <Button type="button" variant="lightGhost" aria-label={`Fill ${by("hole").length} shifts with no coverage`} onClick={() => setFillOpen(true)}>
              <AlarmMark kind="hole" size={16} tip={false} onDark />
              Fill
            </Button>
          ) : null}
          {by("leftover").length ? (
            <Button type="button" variant="lightGhost" aria-label={`Remove ${by("leftover").length} closed-day names`} onClick={() => void clearClosed()}>
              <AlarmMark kind="leftover" size={16} tip={false} onDark />
              Clear
            </Button>
          ) : null}
          <Button type="button" variant="away" aria-label="Someone called in sick" onClick={() => openSick()}>
            <Mark icon="timeOff" tip={false} />
            Mark out
          </Button>
        </>
      }
      graphic={
        <div className="size-full">
          <MonthDial doc={doc} steps={steps} onPick={pickDay} selectedDay={nav.selectedDay} />
        </div>
      }
    />
  );
}
