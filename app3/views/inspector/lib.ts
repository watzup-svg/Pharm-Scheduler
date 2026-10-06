// Shared helpers for the Inspector: plain-words text, the read-only lock, and consequence lines for placing someone.
import {
  addDays, api, applyScratch, RULE_BY_ID, weekday, type AssignmentSource, type Choice, type DomainState, type Edit, type Evaluation, type ISODate, type RuleResult,
} from "@domain";
import { useApp } from "../../store.ts";
import type { CellView } from "../../derive.ts";
import type { ChipTone } from "../../ui/primitives.tsx";

/** What every store-cell piece needs. `lock` is the one-line reason edits are off (or null). */
export type Ctx = { state: DomainState; ev: Evaluation; asOf: ISODate; lock: string | null; storeId: string; date: ISODate; cv: CellView };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const weekdayName = (d: ISODate) => WEEKDAYS[weekday(d)] ?? "";
/** "Monday, October 12, 2026" */
export const longDate = (d: ISODate) => `${weekdayName(d)}, ${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
/** "Mon Oct 12" */
export const shortDate = (d: ISODate) => `${weekdayName(d).slice(0, 3)} ${(MONTHS[Number(d.slice(5, 7)) - 1] ?? "").slice(0, 3)} ${Number(d.slice(8, 10))}`;

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const numWord = (n: number) => WORDS[n] ?? String(n);
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export const SOURCE_WORDS: Record<AssignmentSource, string> = {
  manual: "Scheduled by you", pattern: "From the pattern", build: "Scheduled by Build", repair: "Scheduled by Find cover", improve: "Scheduled by Improve", emergency: "Emergency",
};

/** Why the screen is read-only, or null when edits are allowed. */
export function useLock(): string | null {
  const proposal = useApp((s) => s.world?.session.proposal ?? null);
  const scenario = useApp((s) => s.world?.session.scenario ?? null);
  const ro = useApp((s) => s.readOnlyProblems);
  if (proposal) return "Accept or discard the preview first.";
  if (scenario && !scenario.parked) return "A what-if is open. Park or discard it to change the schedule.";
  if (ro) return "This file is read-only because some of its data is inconsistent.";
  return null;
}

export function commitEdits(edits: Edit[], label?: string): boolean {
  return useApp.getState().commit(edits, label);
}

export const codeOf = (state: DomainState, storeId: string) => state.stores[storeId]?.code ?? storeId;
export const nameOf = (state: DomainState, pharmacistId: string) => state.pharmacists[pharmacistId]?.name ?? pharmacistId;

/** Why a pharmacist cannot work a store on a date, in a word or two ("vacation"). */
export function unavailReason(state: DomainState, pharmacistId: string, storeId: string, date: ISODate): string {
  const ph = state.pharmacists[pharmacistId];
  if (ph && ((ph.activeFrom !== undefined && ph.activeFrom > date) || (ph.inactiveFrom !== undefined && ph.inactiveFrom <= date))) return "not active";
  const u = Object.values(state.unavailability).find((x) => x.pharmacistId === pharmacistId && x.first <= date && date <= x.last && (x.status === "Approved" || x.status === "Actual") && (!x.scopeStoreId || x.scopeStoreId === storeId));
  if (!u) return "time off";
  return u.type === "Vacation" ? "vacation" : u.type === "Sick" ? "sick" : u.type === "Turned-down" ? "turned down this store" : "time off";
}

/** Day number of a pharmacist's run if they work `date` (counting the unbroken days before it). */
function runPosition(state: DomainState, pharmacistId: string, date: ISODate): number {
  const days = new Set(Object.values(state.assignments).filter((a) => a.pharmacistId === pharmacistId).map((a) => a.date));
  let n = 1;
  let d = date;
  while (days.has(addDays(d, -1))) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

export type Phrase = { text: string; tone: ChipTone; glyph: string; hard: boolean };

/** One plain consequence line for a Choice. `hard` = a licensing stop that cannot be accepted. */
export function describeChoice(state: DomainState, c: Choice, storeId: string, date: ISODate): Phrase {
  const parts: string[] = [];
  let tone = "ok" as ChipTone;
  let hard = false;
  const store = state.stores[storeId];
  const ph = state.pharmacists[c.pharmacistId];
  for (const rule of c.blocks) {
    if (rule === "availability") parts.push(`Not available: ${unavailReason(state, c.pharmacistId, storeId, date)}`);
    else if (rule === "licensing") {
      hard = true;
      const exp = store?.state && ph?.licenses ? ph.licenses[store.state] : undefined;
      parts.push(store?.state && ph?.licenses && store.state in ph.licenses && exp ? `License expired ${exp}` : `Not licensed in ${store?.state ?? "this state"}`);
    } else if (rule === "closure") parts.push("Store is closed that day");
    else if (rule === "double-booking") parts.push(`Already booked at ${c.currently.split(",").map((s) => codeOf(state, s)).join(" and ")} that day`);
    else parts.push(RULE_BY_ID[rule]?.message ?? rule);
  }
  if (c.blocks.length) tone = "serious";
  const warn = () => { if (tone === "ok") tone = "warning"; };
  if (c.currently !== "off" && !c.blocks.includes("double-booking")) {
    const here = codeOf(state, c.currently);
    parts.push(c.leavesShort ? `At ${here} today, would leave ${here} short` : `At ${here} today`);
    if (c.leavesShort) warn();
  }
  const requested = Object.values(state.unavailability).some((u) => u.pharmacistId === c.pharmacistId && u.status === "Requested" && u.first <= date && date <= u.last && (!u.scopeStoreId || u.scopeStoreId === storeId));
  if (requested) { parts.push("Asked for time off (not decided yet)"); warn(); }
  if (c.warns.includes("travel-hard")) { parts.push(`Long drive (${c.travelMinutes ?? "?"} min), over the hard limit`); warn(); }
  else if (c.warns.includes("travel-soft")) { parts.push(`Long drive (${c.travelMinutes ?? "?"} min)`); warn(); }
  if (c.warns.includes("consecutive-days")) { parts.push(`${ordinal(runPosition(state, c.pharmacistId, date))} day in a row`); warn(); }
  if (c.unknown.some((r) => r.startsWith("travel"))) { parts.push("Drive time not known"); warn(); }
  if (c.unknown.includes("licensing")) { parts.push("Licensing not recorded"); warn(); }
  if (!c.warns.some((w) => w.startsWith("travel")) && c.travelMinutes !== null && c.travelMinutes > 0) parts.push(`Drive ${c.travelMinutes} min`);
  if (c.currently === "off" && !c.blocks.length && !requested) parts.unshift("Free");
  const glyph = tone === "serious" ? "!" : tone === "warning" ? "▲" : "✓";
  return { text: parts.join(" · ") || "Free", tone, glyph, hard };
}

/** The Choice for one pharmacist at one store (choicesFor does this for everyone at one store). Null if the edit cannot be applied. */
export function choiceFor(state: DomainState, asOf: ISODate, pharmacistId: string, storeId: string, date: ISODate, baseEv?: Evaluation): Choice | null {
  const range = { from: date, to: date };
  const base = baseEv ?? api.evaluate(state, asOf, { range });
  const mine = Object.values(state.assignments).filter((a) => a.pharmacistId === pharmacistId && a.date === date);
  if (mine.some((a) => a.storeId === storeId)) return null;
  const move = mine.length === 1 ? mine[0]! : null;
  const edit: Edit = move ? { t: "move", assignmentId: move.id, toStoreId: storeId } : { t: "place", storeId, pharmacistId, date };
  const next = applyScratch(state, [edit]);
  if ("refused" in next) return null;
  const ev = api.evaluate(next, asOf, { range });
  const a = move ? next.assignments[move.id] : Object.values(next.assignments).find((x) => x.pharmacistId === pharmacistId && x.storeId === storeId && x.date === date);
  const res = a ? ev.assignments[a.id] : undefined;
  if (!a || !res) return null;
  const fails = res.results.filter((r) => r.verdict === "Fail" && !r.overridden);
  const kind = (id: string) => RULE_BY_ID[id]?.kind;
  const baseOf = state.pharmacists[pharmacistId]?.baseStoreId ?? null;
  const pair = baseOf && baseOf !== storeId ? state.travel[`${baseOf}|${storeId}`] : null;
  let leavesShort: Choice["leavesShort"] = null;
  if (move) {
    const was = base.cells[`${move.storeId}|${date}`]?.open ?? 0;
    const now = ev.cells[`${move.storeId}|${date}`]?.open ?? 0;
    if (now > was) leavesShort = { storeId: move.storeId, open: now };
  }
  return {
    pharmacistId, currently: mine.length ? mine.map((m) => m.storeId).sort().join(",") : "off",
    blocks: fails.filter((r) => kind(r.ruleId) === "presence").map((r) => r.ruleId),
    warns: fails.filter((r) => kind(r.ruleId) === "policy").map((r) => r.ruleId),
    unknown: res.results.filter((r) => r.verdict === "Unknown").map((r) => r.ruleId),
    travelMinutes: baseOf === storeId ? 0 : pair ? pair.minutes : null,
    counts: res.counts, leavesShort, action: move ? "move" : "place", ...(move ? { assignmentId: move.id } : {}),
    unavailable: res.results.some((r) => r.ruleId === "availability" && r.verdict === "Fail"),
  };
}

/** A rule failure in plain words (without the fix). */
export function plainFail(state: DomainState, r: RuleResult, pharmacistId: string, storeId: string, date: ISODate): string {
  switch (r.ruleId) {
    case "availability": return `Not available: ${unavailReason(state, pharmacistId, storeId, date)}.`;
    case "travel-hard": return `The drive is ${r.signature} minutes, over the hard limit.`;
    case "travel-soft": return `Long drive (${r.signature} min).`;
    case "consecutive-days": return `${ordinal(Number(/\d+/.exec(r.detail)?.[0] ?? "0"))} day in a row.`;
    case "double-booking": return "Booked at two stores the same day.";
    default: return /[.!?]$/.test(r.detail) ? r.detail : `${r.detail}.`;
  }
}
