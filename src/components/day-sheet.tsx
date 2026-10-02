import { storeTag as labelOf } from "@/lib/schedule/label";
import { Check, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { dayDomId, dayView } from "@/components/day-view";
import { CloseStoreMenu } from "@/components/close-menu";
import { Mark, reasonIcon } from "@/components/icons";
import { okToPlace } from "@/components/usual-off";
import { HoldButton } from "@/components/ui/hold-button";
import { whyOut } from "@/lib/schedule/why-out";
import { DoubleCalendars } from "@/components/double-calendars";
import { acceptedItems } from "@/lib/schedule/accept";
import { closureFor } from "@/lib/schedule/closure";
import { PtoPlaceDialog } from "@/components/pto-place-dialog";
import { announce } from "@/components/undo";
import { ActionBar } from "@/components/ui/action-bar";
import { StateMark } from "@/components/marks";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, useWide } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { daysInMonth, monthName, weekdayLong } from "@/lib/schedule/calendar";
import { awayFromHome, monthStatus } from "@/lib/schedule/dashboard";
import { fixSteps, keepDoubleLabel, stepRef, storeLabel } from "@/lib/schedule/fix";
import { personHints } from "@/lib/schedule/hints";
import { getCell } from "@/lib/schedule/grid";
import { isOpenDay } from "@/lib/schedule/place";
import { issueKey } from "@/lib/schedule/rules";
import { anchorOf, issueOrder, nextAfter } from "@/lib/schedule/issue-cursor";
import { plannedFillSlot, ptoPlanned, type PlannedPlace } from "@/lib/schedule/stamp";
import type { SlotId } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";
import { SlotBlock } from "@/components/day-sheet-slot";
import { acceptKeyFor } from "@/components/day-sheet-extras";

/** The one place a cell is edited. Opens from a calendar day, a problem, or a dashboard row. */
export function DaySheet() {
  const sheet = useViewStore((s) => s.sheet);
  const closeSheet = useViewStore((s) => s.closeSheet);
  // When the sheet closes, put keyboard focus back on the day that was being edited, so Tab and the arrows carry on from there.
  const prev = useRef(sheet);
  useEffect(() => {
    const last = prev.current;
    prev.current = sheet;
    if (last && !sheet) {
      window.setTimeout(() => document.getElementById(dayDomId(last.store, last.day))?.focus({ preventScroll: true }), 0);
    }
  }, [sheet]);
  const wide = useWide();
  return (
    <Dialog modal={!wide} open={sheet != null} onOpenChange={(open) => (!open ? closeSheet() : undefined)}>
      {sheet ? <SheetBody key={`${sheet.store}|${sheet.day}`} /> : null}
    </Dialog>
  );
}

function SheetBody() {
  const wide = useWide();
  const sheet = useViewStore((s) => s.sheet)!;
  const openSheet = useViewStore((s) => s.openSheet);
  const closeSheet = useViewStore((s) => s.closeSheet);
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const setCell = useScheduleStore((s) => s.setCell);
  const keepDouble = useScheduleStore((s) => s.keepDouble);
  const fillSlot = useScheduleStore((s) => s.fillSlot);
  const acceptProblems = useScheduleStore((s) => s.acceptProblems);
  const unacceptProblems = useScheduleStore((s) => s.unacceptProblems);
  const reopenStoreDay = useScheduleStore((s) => s.reopenStoreDay);
  const setNote = useScheduleStore((s) => s.setNote);
  const setLastName = useViewStore((s) => s.setLastName);

  const { store, day } = sheet;
  const storeRow = doc.stores.find((s) => s.code === store);
  const storeShort = storeLabel(doc, store);
  const days = daysInMonth(doc.year, doc.month);
  const view = dayView(doc, ev, store, day);
  const open = isOpenDay(doc, store, day);
  const [second, setSecond] = useState(
    sheet.slot === "pharmacist2" || Boolean(getCell(doc.grid, store, "pharmacist2", day).trim()),
  );
  const first = getCell(doc.grid, store, "pharmacist", day).trim();
  const [pick, setPick] = useState<SlotId | null>(
    open && (sheet.seed || sheet.slot === "pharmacist2" || !first) ? sheet.slot : null,
  );
  const [ptoHits, setPtoHits] = useState<PlannedPlace[] | null>(null);
  // Who was just taken off this shift: not offered back as the best fit.
  const [removed, setRemoved] = useState<{ key: string; names: string[] }>({ key: "", names: [] });
  const exclude = removed.key === `${store}|${day}` ? removed.names : [];
  const [note, setNoteText] = useState(doc.dayNotes[store]?.[String(day)] ?? "");
  const ptoRun = useRef<(skip: boolean) => void>(() => {});

  const closure = closureFor(doc, store, day);
  const acceptedHere = acceptedItems(doc, ev).filter(
    (it) => it.day === day && (it.kind === "double" ? view.names.some((n) => n.name === it.name) : it.store === store),
  );
  const steps = fixSteps(doc, ev, "rph").filter(
    (s) => s.day === day && (s.store === store || (s.kind === "double" && s.stores.includes(store))),
  );

  const doubleStep = steps.find((st) => st.kind === "double" && st.stores.length >= 2) ?? null;

  // Opening a day that has an issue puts the header's cursor on it, so the arrows carry on from here.
  useEffect(() => {
    const st = useScheduleStore.getState();
    const here = issueOrder(st.doc, monthStatus(st.doc, st.evaluation).steps).find(
      (x) => x.day === day && (x.store === store || (x.kind === "double" && x.stores.includes(store))),
    );
    if (here) useViewStore.getState().setIssue({ ...anchorOf(here), ym: `${st.doc.year}-${String(st.doc.month).padStart(2, "0")}` });
  }, [store, day]);

  if (!storeRow) return null;

  // The same date order and cursor as the header arrows, so "Next" here and the arrows there are one stepper.
  const allSteps = issueOrder(doc, monthStatus(doc, ev).steps);
  const pos = allSteps.findIndex(
    (st) => st.day === day && (st.store === store || (st.kind === "double" && st.stores.includes(store))),
  );
  const nextStep = !allSteps.length ? null : pos >= 0 ? (allSteps.length > 1 ? allSteps[(pos + 1) % allSteps.length]! : null) : nextAfter(doc, allSteps, day, store);
  const ym = `${doc.year}-${String(doc.month).padStart(2, "0")}`;

  const dateLine = `${weekdayLong(doc.year, doc.month, day)}, ${monthName(doc.year, doc.month).slice(0, 3)} ${day}`;

  /** Done with this change. In a fix run, go straight to the next problem; otherwise close. */
  function finish() {
    if (!sheet.run) {
      closeSheet();
      return;
    }
    const st = useScheduleStore.getState();
    const left = issueOrder(st.doc, monthStatus(st.doc, st.evaluation).steps);
    if (!left.length) {
      closeSheet();
      useViewStore.getState().setIssue(null);
      toast.success("All problems fixed. Time off still prints.");
      return;
    }
    // On to the next issue in the month after this one, the same one the header's next arrow would land on.
    const next = nextAfter(st.doc, left, day, store)!;
    useViewStore.getState().setIssue({ ...anchorOf(next), ym });
    const n = stepRef(next);
    openSheet(n.store, n.day, n.slot, "", true);
  }

  async function place(slot: SlotId, name: string) {
    if (name && getCell(doc.grid, store, slot, day).trim() !== name && !(await okToPlace(doc, name, day))) return;
    setCell(store, slot, day, name);
    setLastName(name);
    const now = useScheduleStore.getState();
    const doubled = now.evaluation.byKey[issueKey(store, day)]?.doubledNames.includes(name);
    const hints = personHints(now.doc, name, store, day).filter((h) => h.kind !== "weekday").map((h) => h.text);
    const home = awayFromHome(now.doc, name, store);
    const warn = [
      doubled ? `${name} is now at two stores on the ${day}. Choose one to keep.` : "",
      home ? `${name} is away from home (their store is ${labelOf(now.doc, home)}).` : "",
      hints.length ? `Check: ${name}. ${hints.join(". ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    announce(`${name} on ${storeShort}, ${dateLine}`, warn || undefined);
    finish();
  }

  function clear(slot: SlotId, name: string) {
    setCell(store, slot, day, "");
    announce(`Cleared ${name} from ${storeShort}, ${dateLine}`);
    // Taking someone off an open shift leaves it empty: stay here and show who can cover, instead of closing the panel.
    const now = useScheduleStore.getState().doc;
    const stillEmpty = open && !RPH_SLOTS.some((sl) => getCell(now.grid, store, sl, day).trim());
    if (stillEmpty) {
      setRemoved({ key: `${store}|${day}`, names: [...exclude, name] });
      setPick(null);
      return;
    }
    finish();
  }

  function stepDay(delta: number) {
    const next = day + delta;
    if (next < 1 || next > days) return;
    openSheet(store, next);
  }

  function requestFill(slot: SlotId) {
    const ref = { store, slot, day };
    const planned = plannedFillSlot(doc, ref);
    const name = getCell(doc.grid, store, slot, day);
    const run = (skipPto: boolean) => {
      fillSlot(ref, skipPto);
      const n = skipPto ? planned.filter((p) => !ptoPlanned(doc, [p]).length).length : planned.length;
      announce(`${name} on ${n} more open ${n === 1 ? "day" : "days"} at ${storeShort}`);
      finish();
    };
    const hits = ptoPlanned(doc, planned);
    ptoRun.current = run;
    if (hits.length) setPtoHits(hits);
    else run(false);
  }

  const holeWhy = view.hole ? whyOut(doc, store, day) : [];
  const showSecond = second || Boolean(getCell(doc.grid, store, "pharmacist2", day).trim());

  return (
    <DialogContent
      sheet
      drawer={wide}
      title={`${storeShort} · ${dateLine}`}
      description={
        pos >= 0
          ? `${pos + 1} / ${allSteps.length}`
          : !open
            ? view.holiday ?? "Closed"
            : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <div className={cn("grid gap-2", nextStep ? "grid-cols-3" : "grid-cols-2")}>
          <Button type="button" variant="secondary" size="sm" className="min-w-0" disabled={day <= 1} onClick={() => stepDay(-1)}>
            <ChevronLeft />
            {day > 1 ? weekdayLong(doc.year, doc.month, day - 1).slice(0, 3) + " " + (day - 1) : "Start"}
          </Button>
          <Button type="button" variant="secondary" size="sm" className="min-w-0" disabled={day >= days} onClick={() => stepDay(1)}>
            {day < days ? weekdayLong(doc.year, doc.month, day + 1).slice(0, 3) + " " + (day + 1) : "End"}
            <ChevronRight />
          </Button>
          {nextStep ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-w-0"
            onClick={() => {
              useViewStore.getState().setIssue({ ...anchorOf(nextStep), ym });
              const n = stepRef(nextStep);
              openSheet(n.store, n.day, n.slot, "", true);
            }}
          >
            Next · {allSteps.length}
            <ChevronRight />
          </Button>
        ) : null}
        </div>

        {steps.length || view.hole ? (
          <div className="rounded-xl bg-illegal-bg px-3 py-3 text-sm text-illegal ring-1 ring-illegal/25" role="status">
            {view.hole ? (
              <div className="flex items-start gap-3">
                <StateMark kind="hole" size={24} tip={false} className="mt-0.5 bg-white" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold">No coverage</p>
                  <p className="text-ink">No pharmacist is scheduled at {storeShort} on {dateLine}.</p>
                  {holeWhy.length ? (
                    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Why it is empty">
                      {holeWhy.map((w, i) => (
                        <li key={`${w.name}-${i}`} className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold", "bg-warn-bg text-warn")}>
                          <Mark icon={w.kind === "sick" ? "sick" : reasonIcon(w.label)} className="size-3.5" />
                          <span className="font-bold">{w.name.split(" ")[0]}</span>
                          {w.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ) : null}
            {steps.map((step) => (
              <div key={`${step.kind}|${step.store}|${step.names.join()}`} className="mt-1 first:mt-0">
                {step.kind !== "hole" ? (
                  <div className="flex items-start gap-2.5">
                    <StateMark kind={step.kind} size={24} tip={false} className="mt-px bg-white" />
                    <p className="min-w-0 flex-1 font-semibold text-pretty">{step.headline}</p>
                  </div>
                ) : null}
                {step.kind === "double" ? <p className="mt-2 font-semibold">Keep {step.names[0]!.split(" ")[0]} at</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {step.kind === "double"
                    ? step.stores.map((code) => (
                        <HoldButton
                          key={code}
                          size="sm"
                          variant="secondary"
                          className="h-auto min-h-11 py-2 text-left whitespace-normal"
                          onHold={() => {
                            keepDouble(step.names[0]!, day, code);
                            announce(`${step.names[0]} kept at ${storeLabel(doc, code)}, ${dateLine}`);
                            finish();
                          }}
                        >
                          {keepDoubleLabel(doc, step.names[0]!, day, code)}
                        </HoldButton>
                      ))
                    : null}
                  {step.kind === "hole" ? <CloseStoreMenu store={store} day={day} variant="secondary" onDone={finish} /> : null}
                  {step.kind !== "license" ? (
                    <HoldButton
                      size="sm"
                      variant="secondary"
                      onHold={() => {
                        acceptProblems([acceptKeyFor(step, store, day)]);
                        announce("Left as is. It no longer blocks printing.");
                        finish();
                      }}
                    >
                      <Check />
                      Leave as is
                    </HoldButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {acceptedHere.length ? (
          <div className="rounded-xl bg-paper px-3 py-3 text-sm ring-1 ring-line" role="status">
            <p className="font-semibold">Left as is</p>
            <ul className="mt-0.5 text-pretty text-muted">
              {acceptedHere.map((it) => (
                <li key={it.key}>{it.label}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  unacceptProblems(acceptedHere.map((x) => x.key));
                  announce("Back on the to-fix list");
                }}
              >
                <Undo2 />
                Put back on the list
              </Button>
              {view.holeAccepted ? <CloseStoreMenu store={store} day={day} /> : null}
            </div>
          </div>
        ) : null}

        {closure ? (
          <div className="rounded-xl bg-paper px-3 py-3 text-sm ring-1 ring-line" role="status">
            <p className="font-semibold">Closed: {closure.label}</p>
            <p className="text-muted">The poster shows CLOSED and the reason. Nobody is scheduled.</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => {
                reopenStoreDay(store, day);
                announce(`${storeShort} reopened on the ${day}. The shift is open.`);
              }}
            >
              <Undo2 />
              Reopen {storeShort}
            </Button>
          </div>
        ) : null}

        {view.off ? (
          <div className="flex items-start gap-3 rounded-xl bg-warn-bg px-3 py-3 text-sm text-warn ring-1 ring-warn/30" role="status">
            <StateMark kind="timeOff" size={24} tip={false} />
            <div className="min-w-0">
              <p className="text-base font-bold">
                {view.names
                  .filter((n) => n.off)
                  .map((n) => n.name)
                  .join(", ")}{" "}
                is on time off
              </p>
              <p className="text-ink">Their name prints in yellow until you replace or remove it.</p>
            </div>
          </div>
        ) : null}

        {view.names.some((n) => n.away) ? (
          <div className="rounded-xl bg-cover px-3 py-2 text-sm ring-1 ring-ok/40" role="status">
            {view.names
              .filter((n) => n.away)
              .map((n) => `${n.name} is away from home (their store is ${labelOf(doc, n.away!)}).`)
              .join(" ")}
            <span className="text-muted"> Shown on the posters as “from {labelOf(doc, view.away!)}”.</span>
          </div>
        ) : null}

        {ev.byKey[issueKey(store, day)]?.needsSecond ? (
          <div className="rounded-xl border border-warn/50 bg-white px-3 py-2 text-sm text-warn" role="status">
            {storeShort} usually has two pharmacists on {weekdayLong(doc.year, doc.month, day)}s. Only one is here.
            <span className="text-muted"> A reminder only. It does not block printing.</span>
          </div>
        ) : null}

        {view.names.flatMap((n) => personHints(doc, n.name, store, day).map((h) => `${n.name}: ${h.text}`)).length ? (
          <div className="rounded-xl border border-warn/50 bg-white px-3 py-2 text-sm text-warn" role="status">
            {view.names.flatMap((n) => personHints(doc, n.name, store, day).map((h) => `${n.name}: ${h.text}`)).join(". ")}.
            <span className="text-muted"> A reminder only. It does not block printing.</span>
          </div>
        ) : null}

        <SlotBlock
          slot="pharmacist"
          open={open}
          picking={pick === "pharmacist"}
          seed={sheet.seed}
          onPick={() => setPick(pick === "pharmacist" ? null : "pharmacist")}
          onChoose={(name) => place("pharmacist", name)}
          onClear={(name) => clear("pharmacist", name)}
          onFill={() => requestFill("pharmacist")}
          onDone={finish}
          exclude={exclude}
        />
        {showSecond ? (
          <SlotBlock
            slot="pharmacist2"
            open={open}
            picking={pick === "pharmacist2"}
            seed={sheet.slot === "pharmacist2" ? sheet.seed : ""}
            onPick={() => setPick(pick === "pharmacist2" ? null : "pharmacist2")}
            onChoose={(name) => place("pharmacist2", name)}
            onClear={(name) => clear("pharmacist2", name)}
            onFill={() => requestFill("pharmacist2")}
            onDone={finish}
            exclude={exclude}
          />
        ) : null}

        <div className="flex flex-col gap-2 border-t border-line pt-3">
        <ActionBar>
        {open && !showSecond ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setSecond(true);
              setPick("pharmacist2");
            }}
          >
            + Pharmacist
          </Button>
        ) : null}

        {open && !view.hole && !view.holeAccepted ? <CloseStoreMenu store={store} day={day} variant="secondary" onDone={finish} /> : null}
        </ActionBar>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Note on the store poster</span>
          <Input
            value={note}
            maxLength={80}
            onChange={(e) => setNoteText(e.target.value)}
            onBlur={() => {
              if (note.trim() === (doc.dayNotes[store]?.[String(day)] ?? "")) return;
              toast.dismiss();
              setNote(store, day, note);
            }}
            placeholder="Optional"
          />
        </label>
        </div>

        {doubleStep ? <DoubleCalendars name={doubleStep.names[0]!} stores={doubleStep.stores.slice(0, 2)} day={day} /> : null}
      </div>
      {ptoHits ? (
        <PtoPlaceDialog
          hits={ptoHits}
          onSkip={() => {
            setPtoHits(null);
            ptoRun.current(true);
          }}
          onPlace={() => {
            setPtoHits(null);
            ptoRun.current(false);
          }}
          onCancel={() => setPtoHits(null)}
        />
      ) : null}
    </DialogContent>
  );
}
