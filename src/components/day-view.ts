import { holidayMatches, isoDate } from "@/lib/schedule/calendar";
import { awayFromHome, covering } from "@/lib/schedule/dashboard";
import { OFF_WORDS } from "@/lib/schedule/employment";
import { personColorHex } from "@/lib/schedule/color";
import { getCell } from "@/lib/schedule/grid";
import { issueKey } from "@/lib/schedule/rules";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import type { Evaluation, ScheduleDoc, SlotId } from "@/lib/schedule/types";

export type DayName = {
  name: string;
  slot: SlotId;
  /** The person's own color, shown as a small dot so people are easy to follow across days. */
  color: string;
  /** Working away from their home store. Not an error. */
  cover: boolean;
  /** Home store code when a regular (non-float) pharmacist is away from it, else null. */
  away: string | null;
  /** On time off this date, or outside their dates with the company. Yellow, still prints. */
  off: boolean;
  /** Words for why: "on time off", "after their last day", "before their first day". */
  offText: string;
  /** In two places this date. */
  double: boolean;
  /** Not licensed in this store's state. */
  unlicensed: boolean;
};

export type DayView = {
  store: string;
  day: number;
  open: boolean;
  /** Holiday name when a holiday is what closes this store. */
  holiday: string;
  names: DayName[];
  /** Open with nobody. */
  hole: boolean;
  /** Accepted by the district manager instead of fixed. Shown quietly; nothing blocks. */
  holeAccepted: boolean;
  leftoverAccepted: boolean;
  doubleAccepted: boolean;
  /** A pharmacist name sitting on a closed day. */
  leftover: boolean;
  double: boolean;
  unlicensed: boolean;
  off: boolean;
  cover: boolean;
  /** First away-from-home pharmacist's home store, or null. */
  away: string | null;
  /** The store usually runs two pharmacists this weekday and has one. A reminder only. */
  needsSecond: boolean;
  note: string;
  why: string;
};

/**
 * Everything the calendar draws for one store-day. Nothing is decided here:
 * holes, doubles, leftovers and time off all come from `evaluate()`.
 */
export function dayView(doc: ScheduleDoc, ev: Evaluation, store: string, day: number): DayView {
  const issue = ev.byKey[issueKey(store, day)];
  const names: DayName[] = [];
  for (const slot of RPH_SLOTS) {
    const name = getCell(doc.grid, store, slot, day).trim();
    if (!name) continue;
    names.push({
      name,
      slot,
      color: personColorHex(name, doc.people.find((p) => p.name === name)?.color),
      cover: covering(doc, name, store),
      away: awayFromHome(doc, name, store),
      off: Boolean(issue?.ptoNames.includes(name)),
      offText: OFF_WORDS[issue?.ptoWhy?.[name] ?? "time-off"],
      double: Boolean(issue?.doubledNames.includes(name)),
      unlicensed: Boolean(issue?.unlicensedNames.includes(name)),
    });
  }
  const date = isoDate(doc.year, doc.month, day);
  return {
    store,
    day,
    open: issue?.open ?? true,
    holiday: holidayMatches(doc.holidays, store, date)?.label ?? "",
    names,
    hole: Boolean(issue?.hole),
    holeAccepted: Boolean(issue?.holeAccepted),
    leftoverAccepted: Boolean(issue?.leftoverAccepted),
    doubleAccepted: Boolean(issue?.doubledAccepted?.length),
    leftover: Boolean(issue?.leftover),
    double: names.some((n) => n.double),
    unlicensed: names.some((n) => n.unlicensed),
    off: names.some((n) => n.off),
    cover: names.some((n) => n.cover),
    away: names.find((n) => n.away)?.away ?? null,
    needsSecond: Boolean(issue?.needsSecond),
    note: doc.dayNotes[store]?.[String(day)] ?? "",
    why: issue?.why ?? "",
  };
}

/** The short form of a name for tight spots: first initial and the last name. */
export function shortNames(people: { name: string }[]): (name: string) => string {
  // The house rule: a full name when it fits, otherwise the first initial and the whole last name ("M. Quenby"). If two people
  // would read the same ("A. Kowal" twice), both keep their full first name so they stay apart.
  const form = (name: string) => {
    const [first = name, ...rest] = name.split(/\s+/);
    return rest.length ? `${first[0]}. ${rest.join(" ")}` : first;
  };
  const counts = new Map<string, number>();
  for (const p of people) counts.set(form(p.name), (counts.get(form(p.name)) ?? 0) + 1);
  return (name) => ((counts.get(form(name)) ?? 0) > 1 ? name : form(name));
}

export function dayDomId(store: string, day: number): string {
  return `day-${store}-${day}`;
}

export type Tone = "closed" | "leftover" | "license" | "double" | "hole" | "accepted" | "off" | "cover" | "ok";

/** The one look a store-day has, most serious first. */
export function toneOf(view: DayView): Tone {
  if (!view.open) return view.leftover ? "leftover" : view.leftoverAccepted ? "accepted" : "closed";
  if (view.unlicensed) return "license";
  if (view.double) return "double";
  if (view.hole) return "hole";
  if (view.holeAccepted || view.doubleAccepted) return "accepted";
  if (view.off) return "off";
  if (view.cover) return "cover";
  return "ok";
}

export const TONE_CLASS: Record<Tone, string> = {
  closed: "hatch bg-shut text-muted",
  leftover: "hatch bg-illegal-bg text-illegal ring-2 ring-illegal",
  license: "border-2 border-dotted border-illegal bg-illegal-bg text-illegal",
  double: "bg-illegal-bg text-illegal ring-2 ring-illegal",
  hole: "border-2 border-dashed border-illegal bg-illegal-bg text-illegal",
  accepted: "border-2 border-dashed border-muted bg-paper text-ink",
  off: "bg-warn-bg text-warn ring-1 ring-warn/40",
  cover: "bg-cover text-ink ring-1 ring-ok/40",
  ok: "bg-white text-ink ring-1 ring-line",
};

export const TONE_TAG: Record<Tone, string> = {
  closed: "",
  leftover: "closed",
  license: "license",
  double: "twice",
  hole: "NO COVER",
  accepted: "accepted",
  off: "time off",
  cover: "cover",
  ok: "",
};

/** The word on a cell's tag. A regular pharmacist away from home says where from; a float only says cover. */
export function tagOf(view: DayView, tone: Tone, name: (code: string) => string = (c) => c): string {
  if (tone === "cover" && view.away) return `from ${name(view.away)}`;
  if (tone === "ok" && view.needsSecond) return "1 of 2";
  return TONE_TAG[tone];
}
