// What the Time off header band says about the selected person-day: who, what kind of time off, whether it is decided, and what it does to the stores.
import { choicesFor, type DomainState, type ISODate } from "@domain";
import { weekday } from "@domain";
import type { Explain } from "../wall/explain.ts";
import { niceDate } from "../wall/model.ts";
import { opensIfApprovedAll } from "./lib.ts";
import { indexRecords, kindOf, recordsOn, typeWord } from "./sheet.ts";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d: ISODate) => `${DAYS[weekday(d)]}, ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const span = (u: { first: ISODate; last: ISODate }) => (u.first === u.last ? niceDate(u.first) : `${niceDate(u.first)} to ${niceDate(u.last)}`);

export function explainTimeOff(state: DomainState, sel: { pharmacistId?: string; storeId?: string; date: ISODate } | null, asOf: ISODate): Explain | null {
  if (!sel || sel.storeId || !sel.pharmacistId) return null;
  const p = state.pharmacists[sel.pharmacistId];
  if (!p) return null;
  const first = p.name.split(" ")[0] ?? p.name;
  const date = sel.date;
  const recs = recordsOn(indexRecords(state).get(p.id), date);
  const u = recs[0];
  const name = (id: string) => state.stores[id]?.name ?? id;
  const at = [...new Set(Object.values(state.assignments).filter((a) => a.pharmacistId === p.id && a.date === date).map((a) => a.storeId))];
  const base = p.baseStoreId ? state.stores[p.baseStoreId] : undefined;
  const also = recs.slice(1).map((r) => `${first} also has ${typeWord(r).toLowerCase()} on file (${kindOf(r) === "waiting" ? "waiting for your answer" : kindOf(r) === "declined" ? "declined" : "approved"}), ${span(r)}.`);
  const homeLine = `${first}'s home store is ${base ? `${base.name} (${base.code})` : "not recorded"}.`;
  const noteLine = u?.note ? `Note on the request: "${u.note}".` : null;
  if (!u) {
    return {
      mark: null, tone: "ok", headline: `${p.name} is not off`, context: longDate(date),
      more: [at.length ? `${first} is scheduled at ${list(at.map(name))} that day.` : `${first} is not scheduled anywhere that day.`, homeLine, "Drag across days on this row to add time off."],
    };
  }
  const k = kindOf(u);
  if (k === "approved") {
    const bad = at.length > 0;
    return {
      mark: u.type === "Sick" ? "sick" : "away", tone: bad ? "bad" : "ok",
      headline: `${p.name} is ${u.type === "Sick" ? "out sick" : "off"} ${span(u)}`, context: `${typeWord(u)} · approved · ${longDate(date)}`,
      more: [
        bad ? `${first} is still scheduled at ${list(at.map(name))} that day, so ${at.length === 1 ? "that store is" : "those stores are"} short. Find someone to cover, or take ${first} off the schedule.` : `No store is left short by this time off.`,
        ...(noteLine ? [noteLine] : []), homeLine, ...also,
      ],
    };
  }
  if (k === "waiting") {
    const cells = opensIfApprovedAll(state, [u], asOf).get(u.id) ?? [];
    const firstCell = cells[0];
    const covers = firstCell ? choicesFor(state, firstCell.storeId, firstCell.date, asOf).filter((c) => c.counts && !c.unavailable && c.pharmacistId !== p.id).length : 0;
    return {
      mark: "waiting", tone: cells.length ? "warn" : "ok",
      headline: `${p.name} asked for ${span(u)} off`, context: `${typeWord(u)} · waiting for your answer · ${longDate(date)}`,
      more: [
        cells.length ? `If you approve, ${cells.length === 1 ? `${name(firstCell!.storeId)} is left short on ${niceDate(firstCell!.date)}` : `${cells.length} store days are left short, starting with ${name(firstCell!.storeId)} on ${niceDate(firstCell!.date)}`}. ${covers ? `${covers} ${covers === 1 ? "pharmacist" : "pharmacists"} could cover the first.` : "Nobody is free to cover the first."}` : "If you approve, every store stays covered.",
        ...(noteLine ? [noteLine] : []), homeLine, ...also,
      ],
    };
  }
  return {
    mark: "declined", tone: "ok",
    headline: `${p.name}: request declined`, context: `${typeWord(u)} · ${span(u)} · ${longDate(date)}`,
    more: [`You turned this request down, so ${first} is expected to work as scheduled.`, ...(noteLine ? [noteLine] : []), ...also],
  };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
