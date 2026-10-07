// The "typical month": what the standing patterns alone say each pharmacist does each day (no time off, no sickness, no edits). Pure.
import { addDays, standingMatches, toDayNumber, weekday, expectedOn, type DomainState, type ISODate, type Pharmacist, type Standing } from "@domain";
import { isWeekend, niceDate, type CellModel } from "../wall/model.ts";
import { weeklyNeedWithDates } from "./lib.ts";

export function standardRows(state: DomainState, people: Pharmacist[], dates: ISODate[], asOf: ISODate): CellModel[][] {
  const byPD = new Map<string, string[]>();
  for (const d of dates) for (const e of expectedOn(state, d)) { const k = `${e.pharmacistId}|${d}`; byPD.set(k, [...(byPD.get(k) ?? []), e.storeId]); }
  return people.map((p, r) => dates.map((date, c) => {
    const stores = [...new Set(byPD.get(`${p.id}|${date}`) ?? [])];
    const codes = stores.map((id) => state.stores[id]?.code ?? id);
    const closed = stores.filter((id) => weeklyNeedWithDates(state, id, date) === 0);
    const double = stores.length > 1;
    const bad = double || closed.length > 0;
    const lines = codes.length ? [`Works at ${codes.join(" and ")}`, ...(double ? ["Two patterns put them at two stores"] : []), ...closed.map((id) => `${state.stores[id]?.code ?? id} is closed that day`)] : ["Not scheduled by a pattern"];
    return {
      axis: "pharmacist", r, c, date, pharmacistId: p.id, past: false, weekend: isWeekend(date), asOfCol: date === asOf, closed: false,
      chips: [], open: 0, short: 0, locum: 0, marker: null, label: `${p.name}, ${niceDate(date)}: ${codes.length ? `pattern puts them at ${codes.join(" and ")}` : "no pattern"}${bad ? ", a problem" : ""}`,
      hasDrag: false, block: stores.length ? (bad ? "good" : "work") : "none", chip: bad ? (double ? "double" : "closure") : null, iconTone: bad ? "bad" : null, chipN: 0,
      frac: codes.length ? codes.join("+") : null, people: stores.length, ghostAdd: 0, ghostRem: 0, names: [p.name], reason: "",
      tip: [`${p.name} · ${niceDate(date)}`, ...lines].join(" | "), tone: bad ? "bad" : "plain", centered: true,
    } satisfies CellModel;
  }));
}

/** The weekly grid for one person, read back from their patterns: one week per step of the longest cycle (up to 4), each weekday the store they are put at. Date limits and weeks-of-the-month are ignored. */
export function paintFromPatterns(state: DomainState, personId: string, base: ISODate): { cycle: 1 | 2 | 3 | 4; paint: Record<string, string>; simplified: boolean } {
  const mine = Object.values(state.standing).filter((t) => t.pharmacistId === personId);
  const cycle = Math.min(4, Math.max(1, ...mine.map((t) => t.recurrence.cycleWeeks))) as 1 | 2 | 3 | 4;
  const paint: Record<string, string> = {};
  let simplified = mine.some((t) => t.effectiveTo !== undefined || (t.recurrence.nth && t.recurrence.nth.length > 0));
  if (mine.some((t) => t.recurrence.cycleWeeks === 3) && cycle !== 3) simplified = true;
  for (let w = 0; w < cycle; w++) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(base, 7 * w + i);
      const day = weekday(date);
      for (const t of mine) {
        const open: Standing = { ...t, effectiveFrom: "0001-01-01", recurrence: { ...t.recurrence, nth: undefined as never } };
        delete (open as { effectiveTo?: ISODate }).effectiveTo;
        if (open.recurrence.nth === undefined) delete (open.recurrence as { nth?: number[] }).nth;
        if (standingMatches(open, date)) paint[`${w}|${day}`] = t.storeId;
      }
    }
  }
  return { cycle, paint, simplified };
}

/** Which week of the cycle a date falls in, counted from the week of `base`. */
export const weekIndexOf = (date: ISODate, base: ISODate, cycle: number): number => {
  const mon = (d: ISODate) => addDays(d, -((weekday(d) + 6) % 7));
  const n = Math.floor((toDayNumber(mon(date)) - toDayNumber(mon(base))) / 7);
  return ((n % cycle) + cycle) % cycle;
};
