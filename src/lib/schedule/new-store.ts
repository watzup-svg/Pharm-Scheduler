import { driveKey, pairMiles } from "./geo.ts";
import type { ScheduleDoc } from "./types.ts";

export type NeedsDistances = { code: string; others: string[] };

/**
 * Stores that have at least one pair with no measured or hand-set distance (a store added later, or one whose address changed).
 * A pair is covered by the built-in table or a hand-set miles or minutes number; anything else is only an estimate or unknown.
 */
export function storesNeedingDistances(doc: Pick<ScheduleDoc, "stores" | "driveMiles" | "driveMinutes">): NeedsDistances[] {
  const out: NeedsDistances[] = [];
  for (const s of doc.stores) {
    const others = doc.stores
      .filter((o) => o.code !== s.code)
      .filter((o) => {
        const k = driveKey(s.code, o.code);
        if (doc.driveMinutes?.[k] != null) return false;
        const src = pairMiles(doc, s.code, o.code).source;
        return src !== "set" && src !== "table";
      })
      .map((o) => o.code);
    if (others.length) out.push({ code: s.code, others });
  }
  return out;
}
