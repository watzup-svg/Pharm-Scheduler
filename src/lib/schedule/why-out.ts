import { isoDate } from "./calendar.ts";
import { effectiveTimeOff } from "./employment.ts";
import { getCell } from "./grid.ts";
import { timeOffDates } from "./pto.ts";
import { RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

export type WhyOut = {
  name: string;
  kind: "sick" | "time-off" | "requested" | "not-employed";
  /** Short, plain: "Called in sick", "Time off · Dentist", "Asked for time off, not decided yet". */
  label: string;
};

function labelFor(t: { note: string; status?: string }): { kind: WhyOut["kind"]; label: string } {
  const note = t.note.trim();
  if (/^not with the company/i.test(note)) return { kind: "not-employed", label: "Not with the company that day" };
  if (/sick/i.test(note)) return { kind: "sick", label: "Called in sick" };
  if (t.status === "requested") return { kind: "requested", label: `Asked for time off, not decided yet${note ? ` · ${note}` : ""}` };
  return { kind: "time-off", label: `Time off${note ? ` · ${note}` : ""}` };
}

/**
 * Why cover is needed on this day. With a `name` (someone still on the shift): their own reason, if any.
 * Without one (an empty shift): pharmacists whose home store this is and who are out that day, which is
 * almost always why it is empty. Declined requests never count.
 */
export function whyOut(doc: ScheduleDoc, store: string, day: number, name = ""): WhyOut[] {
  const date = isoDate(doc.year, doc.month, day);
  const rows = effectiveTimeOff(doc).filter((t) => t.status !== "declined" && timeOffDates(t).includes(date));
  const placedHere = new Set(RPH_SLOTS.map((slot) => getCell(doc.grid, store, slot, day).trim()).filter(Boolean));
  const who = name ? [name] : doc.people.filter((p) => p.home === store && !placedHere.has(p.name)).map((p) => p.name);
  const out: WhyOut[] = [];
  for (const n of who) {
    for (const t of rows.filter((r) => r.name === n)) out.push({ name: n, ...labelFor(t) });
  }
  return out;
}
