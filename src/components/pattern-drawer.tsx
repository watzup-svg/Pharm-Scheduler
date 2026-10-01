import { useStoreTag } from "@/components/use-store-tag";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PtoPlaceDialog } from "@/components/pto-place-dialog";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { WEEKDAYS } from "@/lib/schedule/calendar";
import {
  getPatternCell,
  plannedStampWeek,
  plannedStampWeekday,
  ptoPlanned,
  type PlannedPlace,
} from "@/lib/schedule/stamp";
import { namesForKind, slotsForKinds } from "@/lib/schedule/slots";
import type { SlotKind } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";

export function PatternDrawer({
  storeCode,
  onStore,
}: {
  storeCode: string;
  onStore: (code: string) => void;
}) {
  const kinds: SlotKind[] = ["RPh"];
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const setPattern = useScheduleStore((s) => s.setPattern);
  const stampWeekday = useScheduleStore((s) => s.stampWeekday);
  const stampWeek = useScheduleStore((s) => s.stampWeek);
  const captureWeek = useScheduleStore((s) => s.captureWeek);
  const copyPattern = useScheduleStore((s) => s.copyPattern);
  const clearPattern = useScheduleStore((s) => s.clearPattern);
  const [copyFrom, setCopyFrom] = useState(doc.stores.find((s) => s.code !== storeCode)?.code ?? "");
  const [ptoHits, setPtoHits] = useState<PlannedPlace[] | null>(null);
  const ptoApply = useRef<(skip: boolean) => void>(() => {});

  function askPto(hits: PlannedPlace[], apply: (skipPto: boolean) => void) {
    if (!hits.length) {
      apply(false);
      return;
    }
    ptoApply.current = apply;
    setPtoHits(hits);
  }

  function closePto() {
    setPtoHits(null);
    ptoApply.current = () => {};
  }

  function report(planned: PlannedPlace[], skip: boolean) {
    const n = planned.length - (skip ? ptoPlanned(doc, planned).length : 0);
    if (n) announce(`Filled ${n} open ${n === 1 ? "day" : "days"}`);
    else toast("Nothing to fill — those days already have names");
  }

  function onStampWeek() {
    const planned = plannedStampWeek(doc, storeCode, kinds);
    askPto(ptoPlanned(doc, planned), (skip) => {
      stampWeek(storeCode, skip, kinds);
      report(planned, skip);
    });
  }

  function onStampWeekday(weekday: number) {
    const planned = plannedStampWeekday(doc, weekday, storeCode, kinds);
    askPto(ptoPlanned(doc, planned), (skip) => {
      stampWeekday(weekday, storeCode, skip, kinds);
      report(planned, skip);
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Store" className="sm:w-56" value={storeCode} onChange={(e) => onStore(e.target.value)}>
          {doc.stores.map((s) => (
            <option key={s.code} value={s.code}>
              {tag(s.code)} · {s.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="button" variant="secondary" size="sm" onClick={() => captureWeek(storeCode, kinds)}>
          Copy from first week
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onStampWeek}>
          Fill empty open days
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => clearPattern(storeCode)}>
          Empty this week
        </Button>
      </div>
      {copyFrom ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Copy week from</span>
          <NativeSelect aria-label="Copy week from" className="sm:w-40" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            {doc.stores
              .filter((s) => s.code !== storeCode)
              .map((s) => (
                <option key={s.code} value={s.code}>
                  {tag(s.code)}
                </option>
              ))}
          </NativeSelect>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => copyPattern(copyFrom, storeCode)}
          >
            Copy onto {storeCode}
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-max text-sm">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-xs">Row</th>
              {WEEKDAYS.map((d, i) => (
                <th key={d} className="px-2 py-2 text-left text-xs">
                  <div className="flex items-center gap-2">
                    {d}
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center px-1 text-xs font-medium text-ink underline"
                      onClick={() => onStampWeekday(i)}
                    >
                      Fill
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slotsForKinds(kinds).map((slot) => (
              <tr key={slot.id} className="border-t border-line">
                <td className="px-2 py-2">
                  {slot.label}
                </td>
                {WEEKDAYS.map((d, wd) => {
                  const value = getPatternCell(doc.pattern, storeCode, slot.id, wd);
                  const options = namesForKind(doc.people, slot.kind);
                  const list = value && !options.includes(value) ? [value, ...options] : options;
                  return (
                    <td key={d} className="px-1 py-1">
                      <select
                        className={cn(
                          "h-11 w-36 rounded-md bg-paper px-1 text-xs",
                          "ring-1 ring-line",
                        )}
                        value={value}
                        onChange={(e) => setPattern(storeCode, slot.id, wd, e.target.value)}
                        aria-label={`${slot.label} ${d}`}
                      >
                        <option value="">Vacant</option>
                        {list.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ptoHits ? (
        <PtoPlaceDialog
          hits={ptoHits}
          onSkip={() => {
            ptoApply.current(true);
            closePto();
          }}
          onPlace={() => {
            ptoApply.current(false);
            closePto();
          }}
          onCancel={closePto}
        />
      ) : null}
    </div>
  );
}
