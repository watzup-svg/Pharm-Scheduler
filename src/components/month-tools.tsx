import { CalendarDays, CalendarPlus, CalendarRange, ClipboardPaste, Keyboard, Sparkles, UserCheck, Wrench } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PasteScheduleDialog } from "@/components/paste-schedule";
import { PatternDrawer } from "@/components/pattern-drawer";
import { PtoPlaceDialog } from "@/components/pto-place-dialog";
import { announce } from "@/components/undo";
import { StartNextMonthButton } from "@/components/start-next-month";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { MONTH_NAMES, monthName, todayParts, weekdayLong } from "@/lib/schedule/calendar";
import { nextYearMonth } from "@/lib/schedule/next-month";
import { plannedStampHomes, ptoPlanned, type PlannedPlace } from "@/lib/schedule/stamp";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

/** Typical week, empty home days, next month, and changing the calendar month. */
export function MonthTools() {
  const doc = useScheduleStore((s) => s.doc);
  const applyPlaces = useScheduleStore((s) => s.applyPlaces);
  const setHelpOpen = useViewStore((s) => s.setHelpOpen);
  const setFillOpen = useViewStore((s) => s.setFillOpen);
  const [weekOpen, setWeekOpen] = useState(false);
  const [weekStore, setWeekStore] = useState(doc.stores[0]?.code ?? "");
  const [nextOpen, setNextOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [ptoHits, setPtoHits] = useState<PlannedPlace[] | null>(null);
  const run = useRef<(skip: boolean) => void>(() => {});

  const next = nextYearMonth(doc.year, doc.month);

  function fillHomeDays() {
    const planned = plannedStampHomes(doc);
    const apply = (skip: boolean) => {
      applyPlaces(planned, skip);
      const skipped = skip ? ptoPlanned(doc, planned).length : 0;
      const n = planned.length - skipped;
      const usualOff = plannedStampHomes(doc, true).length - planned.length;
      const extra = usualOff > 0 ? `. Skipped ${usualOff} usual ${usualOff === 1 ? "day" : "days"} off` : "";
      if (n) announce(`Scheduled ${n} home ${n === 1 ? "day" : "days"}${extra}`);
      else toast("Home days are already scheduled");
    };
    const hits = ptoPlanned(doc, planned);
    run.current = apply;
    if (hits.length) setPtoHits(hits);
    else apply(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="sm">
            <Wrench />
            Tools
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setWeekOpen(true)}>
            <CalendarDays className="size-4" />
            Set up a typical week…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={fillHomeDays}>
            <UserCheck className="size-4" />
            Schedule home days
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFillOpen(true)}>
            <Sparkles className="size-4" />
            Fill shifts with no coverage…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasteOpen(true)}>
            <ClipboardPaste className="size-4" />
            Paste from a spreadsheet…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setNextOpen(true)}>
            <CalendarPlus className="size-4" />
            Start {monthName(next.year, next.month)}…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMonthOpen(true)}>
            <CalendarRange className="size-4" />
            Change month or year…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setHelpOpen(true)}>
            <Keyboard className="size-4" />
            Keyboard shortcuts
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <StartNextMonthButton hideTrigger open={nextOpen} onOpenChange={setNextOpen} />

      <Dialog open={weekOpen} onOpenChange={setWeekOpen}>
        <DialogContent
          sheet
          title="Typical week"
          description="A store’s usual week. Fill adds it to empty open days only; existing names stay."
          className="sm:w-[min(100%-1.5rem,56rem)]"
        >
          <PatternDrawer storeCode={weekStore} onStore={setWeekStore} />
        </DialogContent>
      </Dialog>

      <PasteScheduleDialog open={pasteOpen} onOpenChange={setPasteOpen} />

      <ChangeMonth open={monthOpen} onOpenChange={setMonthOpen} />

      {ptoHits ? (
        <PtoPlaceDialog
          hits={ptoHits}
          onSkip={() => {
            setPtoHits(null);
            run.current(true);
          }}
          onPlace={() => {
            setPtoHits(null);
            run.current(false);
          }}
          onCancel={() => setPtoHits(null)}
        />
      ) : null}
    </>
  );
}

function ChangeMonth({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const doc = useScheduleStore((s) => s.doc);
  const setYearMonth = useScheduleStore((s) => s.setYearMonth);
  const [month, setMonth] = useState(doc.month);
  const [year, setYear] = useState(doc.year);
  const today = todayParts();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setMonth(doc.month);
          setYear(doc.year);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent
        title="Change month or year"
        description={`The 1st of ${monthName(year, month)} is a ${weekdayLong(year, month, 1)}.`}
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-pretty text-muted">
            This changes only the calendar; names stay on the same day numbers. To carry the schedule forward by weekday, use Start next month.
          </p>
          <div className="flex gap-2">
            <NativeSelect aria-label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label="Year"
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              className="w-28"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMonth(today.month);
                setYear(today.year);
              }}
            >
              This month
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setYearMonth(year, month);
                  onOpenChange(false);
                }}
              >
                Change
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
