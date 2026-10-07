// The Time off sheet's model: one row per pharmacist, one cell per day. A cell says what is true of that person that day:
// off (approved), asked (waiting), declined, or nothing. An approved day on which the person is still scheduled keeps its store
// code on it (that store is short). Pure; the page only draws it.
import type { Assignment, DomainState, ISODate, Pharmacist, Unavailability } from "@domain";
import { type CellModel } from "../wall/model.ts";
import { isWeekend, niceDate, shortName } from "../wall/model.ts";
import type { MarkKind } from "../../ui/icons.tsx";

export type Kind = "approved" | "waiting" | "declined";
export const kindOf = (u: Unavailability): Kind => (u.status === "Requested" ? "waiting" : u.status === "Denied" ? "declined" : "approved");
const RANK: Record<Kind, number> = { approved: 0, waiting: 1, declined: 2 };

/** Records that are time off for a person (not the "turned down this store" notes). */
export const isTimeOff = (u: Unavailability) => !u.scopeStoreId && u.type !== "Turned-down";

export function indexRecords(state: DomainState): Map<string, Unavailability[]> {
  const m = new Map<string, Unavailability[]>();
  for (const u of Object.values(state.unavailability)) {
    if (!isTimeOff(u)) continue;
    const l = m.get(u.pharmacistId);
    if (l) l.push(u); else m.set(u.pharmacistId, [u]);
  }
  return m;
}

/** The records that touch one day, best first (approved, then waiting, then declined). */
export const recordsOn = (list: Unavailability[] | undefined, d: ISODate) =>
  (list ?? []).filter((u) => u.first <= d && d <= u.last).sort((a, b) => RANK[kindOf(a)] - RANK[kindOf(b)] || (a.id < b.id ? -1 : 1));

export const typeWord = (u: Unavailability) => (u.type === "Vacation" ? "Vacation" : u.type === "Sick" ? "Sick" : "Time off");
const statusWord = (k: Kind) => (k === "approved" ? "approved" : k === "waiting" ? "waiting for your answer" : "declined");

const range = (u: { first: ISODate; last: ISODate }) => (u.first === u.last ? niceDate(u.first) : `${niceDate(u.first)} to ${niceDate(u.last)}`);

export function buildSheetRows(
  state: DomainState, people: Pharmacist[], dates: ISODate[], asOf: ISODate, byP: Map<string, Unavailability[]>, byPD: Map<string, Assignment[]>,
): CellModel[][] {
  return people.map((p, r) => dates.map((date, c) => {
    const recs = recordsOn(byP.get(p.id), date);
    const u = recs[0];
    const kind = u ? kindOf(u) : null;
    const asg = byPD.get(`${p.id}|${date}`) ?? [];
    const codes = [...new Set(asg.map((a) => state.stores[a.storeId]?.code ?? a.storeId))];
    const name = p.name;
    const past = date < asOf;
    const run: CellModel["run"] | undefined = u ? (u.first === u.last ? "single" : date === u.first ? "start" : date === u.last ? "end" : "mid") : undefined;
    // Weeks do not break a bar, but the first visible day of a request that began earlier is a start for the eye.
    const firstShown = !!u && (date === u.first || c === 0);
    let block: CellModel["block"] = "none";
    let chip: MarkKind | null = null;
    let iconTone: CellModel["iconTone"] = null;
    let frac: string | null = null;
    let tone: CellModel["tone"] = "plain";
    const lines: string[] = [];
    let said = "no time off";
    if (u && kind) {
      said = `${typeWord(u)}, ${statusWord(kind)}, ${range(u)}`;
      lines.push(`${typeWord(u)}, ${statusWord(kind)}`, range(u));
      if (u.note) lines.push(u.note);
      if (kind === "approved") {
        const clash = codes.length > 0;
        block = clash ? "good" : "away";
        chip = u.type === "Sick" ? "sick" : "away";
        iconTone = "bad";
        tone = clash ? "bad" : "plain";
        if (clash) { frac = codes.join("+"); lines.push(`Still scheduled at ${codes.join(", ")}: that store is short`); said += `, still scheduled at ${codes.join(", ")}`; }
      } else if (kind === "waiting") {
        block = "req"; chip = "waiting"; iconTone = "warn"; tone = "off";
        if (codes.length) { frac = codes.join("+"); lines.push(`Scheduled at ${codes.join(", ")}`); }
      } else {
        block = "declined"; chip = "declined"; iconTone = "quiet";
      }
    } else if (codes.length) {
      // No time off: show where they work, as the Schedule's People view does, so the sheet reads as context.
      block = "work"; frac = codes.join("+");
      lines.push(`Working at ${codes.join(", ")}`);
    }
    const label = `${name}, ${niceDate(date)}: ${said}${past ? ", past" : ""}`;
    const showChip = !u || run === "single" || run === "start" || firstShown;
    return {
      axis: "pharmacist", r, c, date, pharmacistId: p.id, past, weekend: isWeekend(date), asOfCol: date === asOf, closed: false,
      chips: [], open: 0, short: 0, locum: 0, marker: null, label, hasDrag: false, block, chip: showChip ? chip : null, iconTone,
      chipN: 0, frac: showChip || kind === "approved" || block === "work" ? frac : null, people: asg.length, ghostAdd: 0, ghostRem: 0, names: [name], reason: "",
      tip: [`${shortName(name, 24)} · ${niceDate(date)}`, ...(lines.length ? lines : ["No time off"]), "Open this day"].join(" | "),
      tone, centered: true, ...(run ? { run } : {}),
    } satisfies CellModel;
  }));
}
