import { weekdayLong } from "./calendar.ts";
import { shortStoreName } from "./fix.ts";
import { placeName } from "./place.ts";
import { evaluate } from "./rules.ts";
import { RPH_SLOTS } from "./slots.ts";
import { rankCandidates, type Suggestion } from "./suggest.ts";
import type { ScheduleDoc, SlotId } from "./types.ts";

export type FillRow = {
  store: string;
  storeName: string;
  day: number;
  weekday: string;
  slot: SlotId;
  /** The best person who is free that day, or null when nobody is. */
  pick: Suggestion | null;
};

/**
 * A proposal for every open shift with nobody on it: for each one, in date order, the best person who is free that day.
 * Each choice is made as if the earlier ones were already placed, so nobody is proposed twice on a day and work is spread out.
 * It only proposes. Nothing is placed until the district manager says so.
 */
export function planFill(doc: ScheduleDoc): FillRow[] {
  const rows: FillRow[] = [];
  let working = doc;
  const holes = evaluate(doc).issues.filter((i) => i.hole);
  for (const h of holes) {
    const slot: SlotId = RPH_SLOTS[0]!;
    const pick = rankCandidates(working, h.store, h.day, slot).find((s) => s.state === "free") ?? null;
    rows.push({
      store: h.store,
      storeName: shortStoreName(doc.stores.find((s) => s.code === h.store)?.name ?? h.store),
      day: h.day,
      weekday: weekdayLong(doc.year, doc.month, h.day),
      slot,
      pick,
    });
    if (pick) working = placeName(working, h.store, slot, h.day, pick.name).doc;
  }
  return rows;
}
