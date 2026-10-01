import type { ScheduleDoc } from "./types.ts";

/**
 * What to call a store in headings, badges and lists: its store number when the district has chosen numbers and this
 * store has one, otherwise its letters. The letters are still the store's identity in the file.
 */
export function storeTag(doc: Pick<ScheduleDoc, "stores" | "storeLabels">, code: string): string {
  if (doc.storeLabels === "number") {
    const n = doc.stores.find((s) => s.code === code)?.number?.trim();
    if (n) return n;
  }
  return code;
}

/** True when the choice is "number" but some stores have no number yet (they fall back to their letters). */
export function missingNumbers(doc: Pick<ScheduleDoc, "stores" | "storeLabels">): string[] {
  return doc.storeLabels === "number" ? doc.stores.filter((s) => !s.number?.trim()).map((s) => s.code) : [];
}
