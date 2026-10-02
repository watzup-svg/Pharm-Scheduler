import { Check, ChevronLeft, ChevronRight, Search, TriangleAlert, Undo2, UserCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { dayDomId, dayView } from "@/components/day-view";
import { CloseStoreMenu } from "@/components/close-menu";
import { Suggestions } from "@/components/suggestions";
import { Mark, RoleMark, reasonIcon, type IconKey } from "@/components/icons";
import { okToPlace } from "@/components/usual-off";
import { HoldButton } from "@/components/ui/hold-button";
import { whyOut } from "@/lib/schedule/why-out";
import { DoubleCalendars } from "@/components/double-calendars";
import { acceptedItems } from "@/lib/schedule/accept";
import { closureFor } from "@/lib/schedule/closure";
import { doubleKey, holeKey, leftoverKey } from "@/lib/schedule/rules";
import { rankCandidates } from "@/lib/schedule/suggest";
import { PtoPlaceDialog } from "@/components/pto-place-dialog";
import { announce } from "@/components/undo";
import { ActionBar } from "@/components/ui/action-bar";
import { StateMark } from "@/components/marks";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import { stateName } from "@/lib/schedule/licence";
import { confirmAction } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { ShorterDrives } from "@/components/cover-plans";
import { Dialog, DialogContent, useWide } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { daysInMonth, isoDate, monthName, weekdayLong } from "@/lib/schedule/calendar";
import { stateOfStore } from "@/lib/schedule/licence";
import { awayFromHome, choicesFor, monthStatus, offerable, type HoleChoice } from "@/lib/schedule/dashboard";
import { fixSteps, keepDoubleLabel, nameMatch, stepRef, storeLabel } from "@/lib/schedule/fix";
import { personHints } from "@/lib/schedule/hints";
import { timeOffImpact } from "@/lib/schedule/impact";
import { getCell } from "@/lib/schedule/grid";
import { isOpenDay } from "@/lib/schedule/place";
import { issueKey } from "@/lib/schedule/rules";
import { anchorOf, issueOrder, nextAfter } from "@/lib/schedule/issue-cursor";
import { plannedFillSlot, ptoPlanned, type PlannedPlace } from "@/lib/schedule/stamp";
import type { SlotId } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useStoreTag } from "@/components/use-store-tag";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

const SLOT_LABEL: Record<string, string> = {
  pharmacist: "Pharmacist",
  pharmacist2: "Second pharmacist",
};

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
      home ? `${name} is away from home (their store is ${home}).` : "",
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
                <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
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
                {step.kind !== "hole" ? <p className="font-semibold text-pretty">{step.headline}</p> : null}
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
              .map((n) => `${n.name} is away from home (their store is ${n.away}).`)
              .join(" ")}
            <span className="text-muted"> Shown on the posters as “from {view.away}”.</span>
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

function SlotBlock({
  slot,
  open,
  picking,
  seed,
  onPick,
  onChoose,
  onClear,
  onFill,
  onDone,
  exclude,
}: {
  slot: SlotId;
  open: boolean;
  picking: boolean;
  seed: string;
  onPick: () => void;
  onChoose: (name: string) => void;
  onClear: (name: string) => void;
  onFill: () => void;
  onDone: () => void;
  exclude: string[];
}) {
  const sheet = useViewStore((s) => s.sheet)!;
  const doc = useScheduleStore((s) => s.doc);
  const { store, day } = sheet;
  const name = getCell(doc.grid, store, slot, day).trim();
  // A name in two places is resolved by the "Keep …" choices above, so a separate Clear would only repeat one of them.
  const doubled = useScheduleStore((s) => Boolean(name && s.evaluation.byKey[issueKey(store, day)]?.doubledNames.includes(name)));
  const onTimeOff = useScheduleStore((s) => Boolean(name && s.evaluation.byKey[issueKey(store, day)]?.ptoNames.includes(name)));
  const why = useMemo(() => whyOut(doc, store, day, name), [doc, store, day, name]);
  // A licence the file does not know about: record it here instead of hunting through Setup. The problem stays until the record says so.
  const unlicensed = useScheduleStore((s) => Boolean(name && s.evaluation.byKey[issueKey(store, day)]?.unlicensedNames.includes(name)));
  const updatePerson = useScheduleStore((s) => s.updatePerson);
  const stateCode = stateOfStore(doc.stores.find((x) => x.code === store) ?? { address: "" });
  async function addLicence() {
    const person = doc.people.find((p) => p.name === name);
    if (!person || !stateCode) return;
    const ok = await confirmAction({
      title: `Record ${name.split(" ")[0]} as licensed in ${stateName(stateCode)}?`,
      body: "Only do this if it is true. The licence list is what the check reads; the problem clears because the record changed, not because it was set aside.",
      effects: [`${name} is added to ${stateName(stateCode)} on the People page. You can undo it.`],
      confirmLabel: "Add licence",
    });
    if (!ok) return;
    const err = updatePerson(name, { ...person, licensedStates: [...new Set([...(person.licensedStates ?? []), stateCode])] });
    if (err) toast.error(err);
    else announce(`${name} recorded as licensed in ${stateName(stateCode)}`);
  }
  const fillCount = name && open ? plannedFillSlot(doc, { store, slot, day }).length : 0;
  const storeName = storeLabel(doc, store);

  // An empty shift: the people who can cover it are the whole point, so they lead.
  if (!name && open) {
    return (
      <>
        {slot === "pharmacist" ? <ShorterDrives store={store} day={day} onDone={onDone} /> : null}
        <CoverCard slot={slot} seed={seed} onChoose={onChoose} exclude={exclude} />
      </>
    );
  }

  return (
    <>
    <div className="rounded-xl bg-white p-3 ring-1 ring-line">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">{SLOT_LABEL[slot]}</p>
          <p className={cn("text-pretty break-words text-base font-semibold", !name && "text-muted")}>{name || "No pharmacist"}</p>
        </div>
        {name && phoneOf(doc, name) ? (
          <a
            href={`tel:${phoneOf(doc, name).replace(/[^\d+]/g, "")}`}
            aria-label={`Call ${name} at ${phoneOf(doc, name)}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-md bg-fill text-ink ring-1 ring-edge hover:bg-shut"
          >
            <Mark icon="phone" className="size-5" />
          </a>
        ) : null}
      </div>
      {name || open ? (
        <ActionBar className="mt-2">
          {open ? (
            <Button type="button" variant={picking ? "default" : "secondary"} size="sm" onClick={onPick} aria-expanded={picking}>
              {name ? "Change person" : "Choose person"}
            </Button>
          ) : null}
          {name && open && !picking ? <OutButton name={name} knownReason={why.length > 0} /> : null}
          {unlicensed && stateCode ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => void addLicence()}>
              Add {stateCode} licence
            </Button>
          ) : null}
          {name && !doubled ? (
            <HoldButton variant="default" size="sm" onHold={() => onClear(name)}>
              Remove
            </HoldButton>
          ) : null}
        </ActionBar>
      ) : null}
      {open && why.length ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Why cover is needed">
          {why.map((w, i) => (
            <li
              key={`${w.name}-${i}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                "bg-warn-bg text-warn",
              )}
            >
              <Mark icon={w.kind === "sick" ? "sick" : reasonIcon(w.label)} className="size-3.5" />
              {name ? null : <span className="font-bold">{w.name.split(" ")[0]}</span>}
              {w.label}
            </li>
          ))}
        </ul>
      ) : null}
      {fillCount > 0 && !picking ? (
        <HoldButton variant="secondary" size="sm" className="mt-2 h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal" onHold={onFill} holdMs={900}>
          Schedule {name.split(" ")[0]} on {fillCount} more open {fillCount === 1 ? "day" : "days"} at {storeName}
        </HoldButton>
      ) : null}
    </div>
    {open && !picking && name && onTimeOff ? <CoverCard slot={slot} seed={seed} onChoose={onChoose} exclude={exclude} title={`Replace ${name.split(" ")[0]}`} /> : null}
    {picking && open ? <CoverCard slot={slot} seed={seed} onChoose={onChoose} title="Change to someone else" /> : null}
    </>
  );
}

function tagFor(c: HoleChoice, label: (code: string) => string): { text: string; tone: "plain" | "double" | "off" | "here" | "blocked"; icon?: IconKey } {
  if (c.state === "blocked") return { text: `Not licensed in ${c.lacksLicence}`, tone: "blocked", icon: "licence" };
  if (c.licence === "unrecorded") return { text: `No ${c.licenceState} license on file`, tone: "blocked", icon: "licence" };
  if (c.here) return { text: "here now", tone: "here" };
  if (c.state === "off") return { text: "on time off", tone: "off", icon: "timeOff" };
  if (c.state === "dayoff") return { text: "usual day off", tone: "off", icon: "usualOff" };
  if (c.state === "double") return { text: c.elsewhereSolo.length ? `at ${c.elsewhere.map(label).join(", ")} · only one there` : `at ${c.elsewhere.map(label).join(", ")}`, tone: "double", icon: "elsewhere" };
  return { text: "free", tone: "plain" };
}

function Picker({
  slot,
  seed,
  onChoose,
  exclude = [],
}: {
  slot: SlotId;
  seed: string;
  onChoose: (name: string) => void;
  exclude?: string[];
}) {
  const sheet = useViewStore((s) => s.sheet)!;
  const doc = useScheduleStore((s) => s.doc);
  const storeTag = useStoreTag();
  const { store, day } = sheet;
  const [q, setQ] = useState(seed);
  const inputRef = useRef<HTMLInputElement>(null);
  const choices = useMemo(() => choicesFor(doc, store, day, slot), [doc, store, day, slot]);
  // With no search typed, the best few are shown above with reasons, so the list below is everyone else.
  const top = useMemo(
    () => (q.trim() ? [] : rankCandidates(doc, store, day, slot, { exclude }).filter((x) => x.state === "free").slice(0, 3).map((x) => x.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, store, day, slot, q, exclude.join("|")],
  );
  const shown = useMemo(() => {
    // Nobody who can't be offered for this state is listed, until their name is typed on purpose. Then they show with the reason,
    // last; "not licensed" can't be picked, "no license on file" can (you may know something the file doesn't).
    const rank = (c: HoleChoice) => (offerable(c) ? 0 : c.state === "blocked" ? 2 : 1);
    const pool = q.trim() ? choices : choices.filter(offerable);
    const ordered = [...pool].sort((a, b) => rank(a) - rank(b)).filter((c) => !top.includes(c.name));
    if (!q.trim()) return ordered;
    return ordered
      .map((c) => ({ c, m: nameMatch(c.name, q) }))
      .filter((x): x is { c: HoleChoice; m: NonNullable<ReturnType<typeof nameMatch>> } => x.m != null)
      .sort((a, b) => a.m.score - b.m.score || a.c.name.localeCompare(b.c.name))
      .map((x) => x.c);
  }, [choices, q, top]);

  // Only pull up the keyboard where there is a real one.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches || seed) inputRef.current?.focus({ preventScroll: true });
  }, [seed]);

  return (
    <div className="flex flex-col gap-3">
      {!q.trim() ? <Suggestions store={store} day={day} slot={slot} exclude={exclude} onPick={(s) => onChoose(s.name)} /> : null}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" />
      <Input
        className="pl-9"
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          const pickName = top[0] ?? shown[0]?.name;
          if (e.key === "Enter" && pickName) {
            e.preventDefault();
            onChoose(pickName);
          }
        }}
        aria-label="Find a pharmacist"
        placeholder="Find someone else"
        autoComplete="off"
        enterKeyHint="done"
      />
      </div>
      {shown.length > 0 || q.trim() ? <p className="-mb-2 px-1 text-sm font-semibold text-ink">{q.trim() ? "Matches" : "Everyone else"}</p> : null}
      <ul className="max-h-[38dvh] overflow-y-auto overscroll-contain" aria-label="Everyone else, free first">
        {shown.length === 0 ? <li className="px-2 py-3 text-sm text-muted">No one matches “{q.trim()}”</li> : null}
        {shown.map((c) => {
          const tag = tagFor(c, storeTag);
          return (
            <li key={c.name} className="flex items-center gap-1">
              <button
                type="button"
                disabled={c.state === "blocked"}
                onClick={() => onChoose(c.name)}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-paper focus-visible:bg-paper focus-visible:outline-none",
                  c.here && "font-semibold",
                  c.state === "blocked" && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="truncate">{c.name}</span>
                    {c.home ? <RoleMark float={c.float} store={storeTag(c.home)} className="text-xs font-normal text-muted" /> : null}
                  </span>
                  {c.hints.length ? (
                    <span className="block truncate text-xs font-normal text-warn">
                      {c.hints.map((h) => h.text).join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-2 py-0.5 text-xs",
                    tag.tone === "plain" && "text-muted",
                    tag.tone === "here" && "bg-paper text-ink",
                    tag.tone === "off" && "bg-warn-bg text-warn",
                    tag.tone === "double" && "border border-dashed border-illegal text-illegal",
                    tag.tone === "blocked" && "border border-dotted border-illegal text-illegal",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {tag.icon ? <Mark icon={tag.icon} className="size-3.5" /> : null}
                    {tag.text}
                  </span>
                </span>
              </button>
              {phoneOf(doc, c.name) ? (
                <a
                  href={`tel:${phoneOf(doc, c.name).replace(/[^\d+]/g, "")}`}
                  aria-label={`Call ${c.name} at ${phoneOf(doc, c.name)}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-paper"
                >
                  <Mark icon="phone" className="size-4" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!q.trim() ? <NotOffered choices={choices} /> : null}
      <ReliefAdd onChoose={onChoose} />
    </div>
  );
}

/** A one-day relief or agency pharmacist who isn't on the roster. Added as a person who is only available that day. */
function ReliefAdd({ onChoose }: { onChoose: (name: string) => void }) {
  const sheet = useViewStore((s) => s.sheet)!;
  const doc = useScheduleStore((s) => s.doc);
  const addPerson = useScheduleStore((s) => s.addPerson);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const { store, day } = sheet;
  const storeRow = doc.stores.find((x) => x.code === store);
  const state = storeRow ? stateOfStore(storeRow) : "";
  const date = isoDate(doc.year, doc.month, day);
  function add() {
    const error = addPerson({
      name: name.trim(),
      role: "Pharmacist",
      home: store,
      lead: false,
      phone: "",
      color: "",
      licensedStates: state ? [state] : [],
      startsOn: date,
      endsOn: date,
    });
    if (error) {
      setErr(error);
      return;
    }
    announce(`${name.trim()} added for ${monthName(doc.year, doc.month).slice(0, 3)} ${day} only`);
    onChoose(name.trim());
  }
  return (
    <details className="px-1 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center underline">Relief pharmacist not on the list?</summary>
      <div className="flex flex-col gap-2 pb-2">
        <p className="text-xs text-muted text-pretty">
          Adds them for {monthName(doc.year, doc.month).slice(0, 3)} {day} only{state ? `, licensed in ${state}` : ""}. You can widen the dates on the People page.
        </p>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErr("");
            }}
            aria-label="Relief pharmacist name"
            maxLength={80}
            placeholder="Full name"
            autoComplete="off"
          />
          <Button type="button" variant="secondary" disabled={!name.trim()} onClick={add}>
            Add and schedule
          </Button>
        </div>
        {err ? <p className="text-xs font-medium text-illegal">{err}</p> : null}
      </div>
    </details>
  );
}

/** Who is left out of the list because they can't be offered for this state, and why, so nothing is silently missing. */
export function NotOffered({ choices }: { choices: HoleChoice[] }) {
  const doc = useScheduleStore((s) => s.doc);
  const updatePerson = useScheduleStore((s) => s.updatePerson);
  const lacks = choices.filter((c) => c.licence === "lacks");
  const unrecorded = choices.filter((c) => c.licence === "unrecorded" && c.state !== "blocked");
  if (!lacks.length && !unrecorded.length) return null;
  const state = (lacks[0] ?? unrecorded[0])!.licenceState;
  return (
    <details className="px-1 text-xs text-muted">
      <summary className="flex min-h-11 cursor-pointer items-center underline">
        Not shown: {lacks.length + unrecorded.length} can’t be offered for {state}
      </summary>
      <div className="flex flex-col gap-1 pb-2">
        {lacks.length ? (
          <p>
            <span className="font-semibold text-illegal">Not licensed in {state}:</span> {lacks.map((c) => c.name).join(", ")}
          </p>
        ) : null}
        {unrecorded.length ? (
          <p>
            <span className="font-semibold text-warn">No {state} license on file:</span> {unrecorded.map((c) => c.name).join(", ")}. If you know they’re licensed, record it and they’ll be offered.
          </p>
        ) : null}
        {unrecorded.length ? (
          <div className="flex flex-wrap gap-2">
            {unrecorded.map((c) => {
              const p = doc.people.find((x) => x.name === c.name);
              if (!p) return null;
              return (
                <Button
                  key={c.name}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-auto min-h-11 py-2 whitespace-normal"
                  onClick={() => {
                    updatePerson(p.name, { ...p, licensedStates: [...new Set([...(p.licensedStates ?? []), c.licenceState])] });
                    announce(`${p.name} recorded as licensed in ${c.licenceState}`);
                  }}
                >
                  {c.name.split(" ")[0]} is licensed in {c.licenceState}
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** What approving or adding time off would leave with nobody. Suggestions only. */
export function ImpactList({ items }: { items: ReturnType<typeof timeOffImpact> }) {
  const doc = useScheduleStore((s) => s.doc);
  if (items.length === 0) return <p className="rounded-lg bg-ok-bg px-3 py-2 text-xs text-ok">Nothing would be left uncovered.</p>;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-illegal-bg px-3 py-2 text-xs" role="status">
      <p className="font-semibold text-illegal">
        This would leave {items.length} {items.length === 1 ? "shift" : "shifts"} with no coverage:
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((i) => (
          <li key={`${i.store}|${i.day}|${i.slot}`} className="text-pretty">
            <span className="font-medium">
              {i.storeName}, {monthName(doc.year, doc.month).slice(0, 3)} {i.day}
            </span>
            <span className="text-muted">
              {i.suggestions.length ? ` · could cover: ${i.suggestions.map((s) => s.name).join(", ")}` : " · no one free to cover"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Close this sheet and open the "someone is out" helper (sick or time off, then find cover) on this person and day. */
function OutButton({ name, knownReason }: { name: string; knownReason: boolean }) {
  const day = useViewStore((s) => s.sheet?.day ?? 0);
  const closeSheet = useViewStore((s) => s.closeSheet);
  const openSick = useViewStore((s) => s.openSick);
  return (
    <Button
      type="button"
      variant="away"
      size="sm"
      onClick={() => {
        closeSheet();
        openSick({ name, day });
      }}
    >
      <Mark icon="timeOff" tip={false} />
      {knownReason ? "Find cover…" : "Out that day…"}
    </Button>
  );
}

function acceptKeyFor(step: { kind: string; names: string[]; day: number }, store: string, day: number): string {
  if (step.kind === "double") return doubleKey(step.names[0]!, day);
  if (step.kind === "leftover") return leftoverKey(store, day);
  return holeKey(store, day);
}


/**
 * Who can take an empty shift. A green-headed card of its own: free people first, each with a Schedule button, then a
 * search and everyone else. It is separate from the problem notice above it so it is clear these are the people available.
 */
function CoverCard({ slot, seed, onChoose, title, exclude = [] }: { slot: SlotId; seed: string; onChoose: (name: string) => void; title?: string; exclude?: string[] }) {
  const sheet = useViewStore((s) => s.sheet)!;
  const doc = useScheduleStore((s) => s.doc);
  const { store, day } = sheet;
  const free = useMemo(() => rankCandidates(doc, store, day, slot).filter((x) => x.state === "free").length, [doc, store, day, slot]);
  return (
    <section aria-label="Who can cover" className="overflow-hidden rounded-xl bg-white ring-1 ring-ok/40">
      <header className="flex items-center gap-2 bg-ok-bg px-3 py-3">
        <UserCheck aria-hidden className="size-5 shrink-0 text-ok" />
        <h3 className="flex-1 text-base font-semibold">{title ?? (slot === "pharmacist2" ? "Second pharmacist" : "Available to cover")}</h3>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", free ? "bg-white text-ok" : "bg-illegal-bg text-illegal")}>{free ? `${free} free` : "none free"}</span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {free === 0 ? <p className="text-sm font-medium text-illegal">No one is free that day. People working elsewhere or on a usual day off are below.</p> : null}
        <Picker slot={slot} seed={seed} onChoose={onChoose} exclude={exclude} />
      </div>
    </section>
  );
}

function phoneOf(doc: { people: { name: string; phone?: string }[] }, name: string): string {
  return doc.people.find((p) => p.name === name)?.phone?.trim() ?? "";
}
