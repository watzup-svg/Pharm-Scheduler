// Plan ahead: where each future month stands (empty, drafting, ready, posted), what is left to do, and what to do next. Pure; read from the live schedule and its postings.
import { daysInMonth, type DomainState, type ISODate, type World } from "@domain";
import { buildIssues, evaluateCached } from "../../derive.ts";
import { niceDate } from "../wall/model.ts";

export type MonthKind = "empty" | "drafting" | "ready" | "posted";
export type MonthStatus = {
  ym: string;
  from: ISODate;
  to: ISODate;
  kind: MonthKind;
  /** The posted revision that covers the whole month, if any, and how many person-days differ from it now. */
  rev: number | null;
  editedSince: number;
  needed: number;
  filled: number;
  open: number;
  problems: number;
  waiting: number;
  firstOpen: { storeId: string; date: ISODate } | null;
  firstWaiting: { first: ISODate; last: ISODate } | null;
  closedDays: { date: ISODate; note: string }[];
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const monthBounds = (ym: string): { from: ISODate; to: ISODate } => ({ from: `${ym}-01`, to: `${ym}-${String(daysInMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)))).padStart(2, "0")}` });
export const shiftYm = (ym: string, by: number): string => {
  const n = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + by;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
};

const placementsOf = (state: DomainState, from: ISODate, to: ISODate): Record<string, string> => {
  const by: Record<string, string[]> = {};
  for (const a of Object.values(state.assignments)) if (a.date >= from && a.date <= to) (by[`${a.pharmacistId}|${a.date}`] ??= []).push(a.storeId);
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.slice().sort().join(",")]));
};

export function monthStatus(world: World, ym: string, asOf: ISODate): MonthStatus {
  const { from, to } = monthBounds(ym);
  const state = world.state;
  const ev = evaluateCached(state, asOf, { range: { from, to } });
  let needed = 0, filled = 0, open = 0;
  let firstOpen: MonthStatus["firstOpen"] = null;
  for (const c of Object.values(ev.cells).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.storeId < b.storeId ? -1 : 1))) {
    if (c.date < from || c.date > to) continue;
    needed += c.required;
    filled += Math.min(c.covered, c.required);
    open += c.open;
    if (c.open > 0 && !firstOpen) firstOpen = { storeId: c.storeId, date: c.date };
  }
  const problems = buildIssues(state, ev, { from, to }, asOf).filter((i) => i.kind === "violation").length;
  const waitingRecs = Object.values(state.unavailability).filter((u) => u.status === "Requested" && !u.scopeStoreId && u.type !== "Turned-down" && u.last >= from && u.first <= to).sort((a, b) => (a.first < b.first ? -1 : 1));
  const snap = world.journal.snapshots.filter((s) => s.from <= from && s.to >= to).sort((a, b) => b.revision - a.revision)[0] ?? null;
  let editedSince = 0;
  if (snap) {
    const live = placementsOf(state, from, to);
    for (const k of new Set([...Object.keys(live), ...Object.keys(snap.placements).filter((x) => { const d = x.split("|")[1]!; return d >= from && d <= to; })])) if ((live[k] ?? "off") !== (snap.placements[k] ?? "off")) editedSince += 1;
  }
  const hasAny = Object.values(state.assignments).some((a) => a.date >= from && a.date <= to);
  const kind: MonthKind = snap ? "posted" : !hasAny ? "empty" : open === 0 && problems === 0 ? "ready" : "drafting";
  const closedDays = Object.values(state.dateOverrides).filter((o) => o.count === 0 && o.date >= from && o.date <= to && o.note).map((o) => ({ date: o.date, note: o.note })).sort((a, b) => (a.date < b.date ? -1 : 1));
  const dedup = closedDays.filter((d, i, all) => all.findIndex((x) => x.date === d.date) === i);
  return {
    ym, from, to, kind, rev: snap?.revision ?? null, editedSince, needed, filled, open, problems, waiting: waitingRecs.length,
    firstOpen, firstWaiting: waitingRecs[0] ? { first: waitingRecs[0].first < from ? from : waitingRecs[0].first, last: waitingRecs[0].last > to ? to : waitingRecs[0].last } : null, closedDays: dedup,
  };
}

/** What to do next with a month, most useful first, in full sentences. */
export function nextSteps(s: MonthStatus, storeCode: (id: string) => string): string[] {
  const out: string[] = [];
  const range = (a: ISODate, b: ISODate) => (a === b ? niceDate(a) : `${niceDate(a)} to ${niceDate(b)}`);
  if (s.kind === "posted" && s.editedSince > 0) out.push(`${s.editedSince} ${s.editedSince === 1 ? "person-day has" : "person-days have"} changed since revision ${s.rev} was posted. Post revision ${(s.rev ?? 0) + 1} and tell the people affected.`);
  if (s.waiting > 0 && s.firstWaiting) out.push(`Decide ${s.waiting} time-off ${s.waiting === 1 ? "request" : "requests"} first, starting with ${range(s.firstWaiting.first, s.firstWaiting.last)}: they change who is available. Open the Time off screen.`);
  if (s.kind === "empty") out.push("Nothing is scheduled yet. Build places everyone's usual patterns and fills the rest.");
  else if (s.open > 0) out.push(`${s.open} ${s.open === 1 ? "shift is" : "shifts are"} still open${s.firstOpen ? `, the first at ${storeCode(s.firstOpen.storeId)} on ${niceDate(s.firstOpen.date)}` : ""}. Run Build to fill them, or open a gap to choose someone yourself.`);
  if (s.problems > 0) out.push(`${s.problems} ${s.problems === 1 ? "rule is" : "rules are"} broken. Find them in the Issues list on the left.`);
  if (s.kind === "ready") out.push("Every shift is covered and no rule is broken. Post it when you are happy.");
  if (s.kind === "posted" && s.editedSince === 0) out.push(`Posted as revision ${s.rev} and nothing has changed since.`);
  return out;
}

export const nextMonthFrom = (asOf: ISODate): string => shiftYm(asOf.slice(0, 7), 1);
