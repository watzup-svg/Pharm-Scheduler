import { CalendarPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { dropLine, planNextMonth } from "@/lib/schedule/next-month";
import { forecastLine, forecastNextMonth } from "@/lib/schedule/next-month-forecast";
import { StateMark } from "@/components/marks";
import { useScheduleStore } from "@/store/schedule-store";

const LIST_CAP = 8;

export function StartNextMonthButton({
  compact = false,
  label,
  hideTrigger = false,
  open: openProp,
  onOpenChange,
}: {
  compact?: boolean;
  label?: string;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const doc = useScheduleStore((s) => s.doc);
  const applyNextMonth = useScheduleStore((s) => s.applyNextMonth);
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = openProp ?? uncontrolled;
  function setOpen(next: boolean) {
    if (onOpenChange) onOpenChange(next);
    else setUncontrolled(next);
  }
  const plan = useMemo(() => planNextMonth(doc), [doc]);
  // Worked out only while the dialog is open: what the new month would open with, before she presses Start.
  const forecast = useMemo(() => (open ? forecastNextMonth(doc, plan) : null), [open, doc, plan]);
  const shut = plan.dropped.filter((d) => d.reason === "shut");
  const missing = plan.dropped.filter((d) => d.reason === "no-day");
  const unlicensed = plan.dropped.filter((d) => d.reason === "unlicensed");
  const gone = plan.dropped.filter((d) => d.reason === "not-employed");
  const usualOff = plan.dropped.filter((d) => d.reason === "usual-off");
  const text = label ?? "Start next month";

  function confirm() {
    applyNextMonth(plan);
    setOpen(false);
    const n = plan.dropped.length;
    toast.success(
      n
        ? `Started ${plan.monthLabel}. Dropped ${n} name${n === 1 ? "" : "s"}.`
        : `Started ${plan.monthLabel}.`,
    );
  }

  return (
    <>
      {hideTrigger ? null : compact ? (
        <button type="button" className="font-medium text-ink underline" onClick={() => setOpen(true)}>
          {text}
        </button>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <CalendarPlus />
          {text}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Start ${plan.monthLabel}?`}>
          <div className="flex flex-col gap-3 text-sm">
            {forecast ? (
              <p data-forecast className="flex items-start gap-2 font-semibold text-ink">
                {forecast.total ? <StateMark kind="hole" size={20} tip={false} className="mt-0.5" /> : null}
                <span>{forecastLine(plan.monthLabel, forecast)}</span>
              </p>
            ) : null}
            <p className="text-pretty text-muted">
              Copy {plan.fromLabel} by weekday (first Monday to first Monday). Empty days stay empty. Names that would land on a closed day are dropped.
            </p>
            {plan.dropped.length === 0 ? (
              <p>Nothing dropped. Every name lands on an open day.</p>
            ) : (
              <>
                {/* The ones worth reading first; the end-of-month weekdays that simply don't exist are one line at the end. */}
                <DropGroup
                  title={`${unlicensed.length} ${unlicensed.length === 1 ? "is" : "are"} not licensed in that store’s state`}
                  lines={unlicensed.map(dropLine)}
                />
                <DropGroup
                  title={`${gone.length} ${gone.length === 1 ? "is" : "are"} not with the company on that date (relief or past end date)`}
                  lines={gone.map(dropLine)}
                />
                <DropGroup
                  title={`${usualOff.length} would land on a usual day off`}
                  lines={usualOff.map(dropLine)}
                />
                <DropGroup
                  title={`${shut.length} would land on a shut day`}
                  lines={shut.map(dropLine)}
                />
                {missing.length ? (
                  <p className="text-muted">
                    {missing.length} {missing.length === 1 ? "name falls" : "names fall"} on a weekday {plan.monthLabel} doesn’t have (a 5th Thursday, for example), so {missing.length === 1 ? "it isn’t" : "they aren’t"} copied.
                  </p>
                ) : null}
              </>
            )}
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" onClick={confirm}>
                Start {plan.monthLabel}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DropGroup({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  const shown = lines.slice(0, LIST_CAP);
  const more = lines.length - shown.length;
  return (
    <div>
      <p className="font-medium text-ink">{title}</p>
      <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-ink">
        {shown.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {more > 0 ? <p className="mt-1 text-xs text-muted">and {more} more</p> : null}
    </div>
  );
}
