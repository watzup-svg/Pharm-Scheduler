// What the Time off header band says about the selected person-day: who, what kind of time off, whether it is decided, and what it does to the stores.
import type { DomainState, ISODate } from "@domain";
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
  const date = sel.date;
  const recs = recordsOn(indexRecords(state).get(p.id), date);
  const u = recs[0];
  const code = (id: string) => state.stores[id]?.code ?? id;
  const at = Object.values(state.assignments).filter((a) => a.pharmacistId === p.id && a.date === date).map((a) => code(a.storeId));
  const more: string[] = recs.slice(1).map((r) => `Also: ${typeWord(r)}, ${kindOf(r) === "waiting" ? "waiting" : kindOf(r) === "declined" ? "declined" : "approved"}, ${span(r)}`);
  if (!u) {
    return {
      mark: null, tone: "ok", headline: `${p.name} is not off`, context: longDate(date),
      more: at.length ? [`Scheduled at ${at.join(", ")}`] : ["Not scheduled"],
      people: [],
    };
  }
  const k = kindOf(u);
  if (k === "approved") {
    const bad = at.length > 0;
    return {
      mark: u.type === "Sick" ? "sick" : "away", tone: bad ? "bad" : "ok",
      headline: `${p.name} is off ${span(u)}`, context: `${typeWord(u)} · approved · ${longDate(date)}`,
      more: [bad ? `Still scheduled at ${at.join(", ")} that day, so that store is short` : "No store is left short", ...(u.note ? [u.note] : []), ...more],
      people: [{ name: p.name, note: bad ? `off, but scheduled at ${at.join(", ")}` : "off", tone: bad ? "bad" : "ok" }],
    };
  }
  if (k === "waiting") {
    const cells = opensIfApprovedAll(state, [u], asOf).get(u.id) ?? [];
    const first = cells[0];
    return {
      mark: "waiting", tone: cells.length ? "warn" : "ok",
      headline: `${p.name} asked for ${span(u)} off`, context: `${typeWord(u)} · waiting for your answer · ${longDate(date)}`,
      more: [cells.length ? `Approving leaves ${cells.length === 1 ? code(first!.storeId) : `${cells.length} store days`} short${first ? `, starting ${niceDate(first.date)} at ${code(first.storeId)}` : ""}` : "Approving leaves every store covered", ...(u.note ? [u.note] : []), ...more],
      people: [{ name: p.name, note: "asked", tone: cells.length ? "warn" : "ok" }],
    };
  }
  return {
    mark: "declined", tone: "ok",
    headline: `${p.name}: request declined`, context: `${typeWord(u)} · ${span(u)} · ${longDate(date)}`,
    more: [...(u.note ? [u.note] : []), ...more],
    people: [{ name: p.name, note: "declined", tone: "ok" }],
  };
}
