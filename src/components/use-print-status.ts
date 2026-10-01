import { useMemo } from "react";
import { readPrinted } from "@/components/print-extras";
import { monthKey } from "@/lib/schedule/archive";
import { changesSince } from "@/lib/schedule/changes";
import { useScheduleStore } from "@/store/schedule-store";

/** What has been printed for this month, and which stores and people changed since. Read-only. */
export function usePrintStatus(): { printedAt: number | null; stores: Set<string>; people: Set<string>; changed: boolean } {
  const doc = useScheduleStore((s) => s.doc);
  const tick = useScheduleStore((s) => s.printedTick);
  return useMemo(() => {
    const snap = readPrinted(monthKey(doc.year, doc.month));
    const c = changesSince(doc, snap);
    const stores = new Set(Object.keys(c.stores));
    const people = new Set(Object.keys(c.people).filter((n) => doc.people.some((p) => p.name === n)));
    return { printedAt: snap?.at ?? null, stores, people, changed: stores.size > 0 || people.size > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, tick]);
}
