import { useCallback } from "react";
import { storeTag } from "@/lib/schedule/label";
import { useScheduleStore } from "@/store/schedule-store";

/** `tag("EST")` gives the store's number or letters, whichever the district chose. Re-renders when the choice changes. */
export function useStoreTag(): (code: string) => string {
  const stores = useScheduleStore((s) => s.doc.stores);
  const labels = useScheduleStore((s) => s.doc.storeLabels);
  return useCallback((code: string) => storeTag({ stores, storeLabels: labels }, code), [stores, labels]);
}
