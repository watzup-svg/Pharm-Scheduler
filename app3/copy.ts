// Words and sentence shapes, from the old COPY_GUIDE. One name per idea; labels neutral, guidance warm and fact-first.
import { weekday, type Edit, type DomainState, type ISODate } from "../domain/src/index.ts";
import { shortName } from "./names.ts";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue Oct 6". */
export function fmtDate(d: ISODate): string {
  return `${DAYS[weekday(d)]} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
}
export function fmtRange(a: ISODate, b: ISODate): string {
  return a === b ? fmtDate(a) : `${fmtDate(a)} to ${fmtDate(b)}`;
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The rule names as the DM says them. */
export const RULE_WORDS: Record<string, string> = {
  closure: "name on a closed day", licensing: "not licensed", availability: "time off", "double-booking": "two places",
  "travel-soft": "long drive", "travel-hard": "very long drive", "consecutive-days": "many days in a row",
};

/** One sentence for what an edit did, for the confirmation line (with Undo beside it). */
export function describeEdits(state: DomainState, edits: Edit[]): string {
  const name = (id: string) => shortName(state.pharmacists[id]?.name ?? id, 22);
  const store = (id: string) => state.stores[id]?.code ?? id;
  if (edits.length !== 1) return `${plural(edits.length, "change")} saved.`;
  const e = edits[0]!;
  switch (e.t) {
    case "place": return `${name(e.pharmacistId)} is scheduled at ${store(e.storeId)} on ${fmtDate(e.date)}.`;
    case "remove": { const a = state.assignments[e.assignmentId]; return a ? `${name(a.pharmacistId)} is off ${store(a.storeId)} on ${fmtDate(a.date)}.` : "Removed."; }
    case "move": { const a = state.assignments[e.assignmentId]; return a ? `${name(a.pharmacistId)} is at ${store(e.toStoreId)} instead of ${store(a.storeId)} on ${fmtDate(a.date)}.` : "Moved."; }
    case "swap": { const a = state.assignments[e.assignmentId]; return a ? `${name(e.toPharmacistId)} takes ${store(a.storeId)} on ${fmtDate(a.date)} from ${name(a.pharmacistId)}.` : "Swapped."; }
    case "update": return "Updated.";
    case "override": return "Left as is.";
    case "unoverride": return "No longer left as is.";
    case "unavail.add": return `${name(e.pharmacistId)} is out ${fmtRange(e.first, e.last)}.`;
    case "unavail.update": return "Time off updated.";
    case "unavail.remove": return "Time off removed.";
    case "dateOverride.set": return e.count === 0 ? `${store(e.storeId)} is closed on ${fmtDate(e.date)}.` : `${store(e.storeId)} needs ${e.count} on ${fmtDate(e.date)}.`;
    case "dateOverride.clear": return `${store(e.storeId)} is back to its usual need on ${fmtDate(e.date)}.`;
    case "cell.set": return "Updated.";
    default: return "Saved.";
  }
}
