// What is going on in one store-day (or one person-day), said in plain words for the header band: a headline, a line of context, and a few full
// sentences of detail (each fact once). Pure; the same facts the colours and pictures on the wall come from (see storeLook in model.ts).
import { choicesFor, weekday, type DomainState, type Evaluation, type ISODate } from "@domain";
import { buildCellView, dropSuperseded } from "../../derive.ts";
import type { MarkKind } from "../../ui/icons.tsx";
import { RULE_MARK } from "../../ui/icons.tsx";
import { storeLook } from "./model.ts";

export type Explain = {
  /** The picture, or null for "all is well". */
  mark: MarkKind | null;
  /** Colour of the band's big chip: red, yellow, green. */
  tone: "bad" | "warn" | "ok";
  headline: string;
  /** Store, weekday and date. */
  context: string;
  /** Full sentences of detail: what else is true there, why, and what it means. Each fact appears once. */
  more: string[];
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d: ISODate) => `${DAYS[weekday(d)]}, ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const n = (k: number, one: string, many: string) => (k === 1 ? one : many);

type Sel = { storeId?: string; pharmacistId?: string; date: ISODate };

export function explainSelection(state: DomainState, ev: Evaluation, sel: Sel | null, asOf: ISODate): Explain | null {
  if (!sel) return null;
  if (sel.storeId && state.stores[sel.storeId]) return explainStoreDay(state, ev, sel.storeId, sel.date, asOf);
  if (sel.pharmacistId && state.pharmacists[sel.pharmacistId]) return explainPersonDay(state, ev, sel.pharmacistId, sel.date, asOf);
  return null;
}

/** Why a person is not available that day, in words: on vacation, out sick, off, or not on the roster. Dates and the note come from the time-off record. */
function whyAway(state: DomainState, pharmacistId: string, date: ISODate, storeId: string): { phrase: string; when: string; note: string } {
  const ph = state.pharmacists[pharmacistId];
  if (ph && ((ph.activeFrom !== undefined && ph.activeFrom > date) || (ph.inactiveFrom !== undefined && ph.inactiveFrom <= date))) return { phrase: "not on the roster that day", when: "", note: "" };
  const u = Object.values(state.unavailability).find((x) => x.pharmacistId === pharmacistId && x.first <= date && date <= x.last && (x.status === "Approved" || x.status === "Actual") && (!x.scopeStoreId || x.scopeStoreId === storeId));
  if (!u) return { phrase: "not available", when: "", note: "" };
  const d = (x: ISODate) => `${MONTHS[Number(x.slice(5, 7)) - 1]!.slice(0, 3)} ${Number(x.slice(8, 10))}`;
  const when = u.first === u.last ? d(u.first) : `${d(u.first)} to ${d(u.last)}`;
  const phrase = u.type === "Vacation" ? "on vacation" : u.type === "Sick" ? "out sick" : u.type === "Turned-down" ? "not working at this store" : "off";
  return { phrase, when, note: u.note ?? "" };
}

type Problem = { rule: string; sentence: string; detail: string; tone: "bad" | "warn" };

/** Ends a sentence once, even when the last word already ends in a full stop ("Quin Q."). */
const stop = (t: string) => (t.endsWith(".") ? t : `${t}.`);
const list = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** One sentence per thing wrong with one placement, each with a sentence of why and what it means, worst first. */
function problemsOf(state: DomainState, ev: Evaluation, a: { id: string; pharmacistId: string; storeId: string; date: ISODate }): Problem[] {
  const st = state.stores[a.storeId];
  const ph = state.pharmacists[a.pharmacistId];
  const who = ph?.name ?? a.pharmacistId;
  const first = who.split(" ")[0] ?? who;
  const code = st?.code ?? a.storeId;
  const base = ph?.baseStoreId ? state.stores[ph.baseStoreId] : undefined;
  const out: Problem[] = [];
  const results = ev.assignments[a.id]?.results ?? [];
  const failing = dropSuperseded(results.filter((x) => x.verdict === "Fail" && !x.overridden).map((x) => x.ruleId));
  for (const r of results) {
    if (r.verdict !== "Fail" || r.overridden || !failing.includes(r.ruleId)) continue;
    switch (r.ruleId) {
      case "licensing": {
        const held = ph?.licenses ? Object.keys(ph.licenses).sort() : [];
        out.push({ rule: r.ruleId, tone: "bad", sentence: `${who} is not licensed for ${st?.state ? `${st.state} ` : ""}${code}`, detail: `${first} ${held.length ? `holds a licence in ${list(held)}` : "has no licence recorded"}, but ${st?.name ?? code} is ${st?.state ? `in ${st.state}` : "in another state"}, so ${first} does not count toward this shift.` });
        break;
      }
      case "availability": {
        const w = whyAway(state, a.pharmacistId, a.date, a.storeId);
        out.push({ rule: r.ruleId, tone: "bad", sentence: `${who} is scheduled at ${code} but is ${w.phrase}`, detail: `${first} is ${w.phrase}${w.when ? ` (${w.when})` : ""}${w.note ? `, noted as "${w.note}"` : ""}, so ${first} does not count toward this shift. Pick someone who is available, or cover another way.` });
        break;
      }
      case "double-booking": {
        const others = Object.values(state.assignments).filter((x) => x.id !== a.id && x.pharmacistId === a.pharmacistId && x.date === a.date).map((x) => state.stores[x.storeId]?.code ?? x.storeId);
        out.push({ rule: r.ruleId, tone: "bad", sentence: `${who} is booked at two stores: ${[code, ...others].join(" and ")}`, detail: `${first} cannot work both on the same day, so neither shift counts until one of them is moved.` });
        break;
      }
      case "closure": {
        const note = state.dateOverrides[`${a.storeId}|${a.date}`]?.note;
        out.push({ rule: r.ruleId, tone: "bad", sentence: `${who} is placed at ${st?.name ?? code}, which is closed that day`, detail: `${st?.name ?? code} is closed${note ? ` (${note})` : ""}, so ${first}'s name there does not count. Remove ${first} or reopen the store.` });
        break;
      }
      case "travel-hard": case "travel-soft": {
        const mins = /\d+/.exec(r.detail || "")?.[0];
        const hard = r.ruleId === "travel-hard";
        out.push({ rule: r.ruleId, tone: "warn", sentence: `${who} has a ${hard ? "very " : ""}long drive to ${code}${mins ? ` (${mins} minutes)` : ""}`, detail: `${first}'s home store is ${base ? `${base.name} (${base.code})` : "not recorded"}. Drives over ${state.config.travelSoftMinutes} minutes are flagged and over ${state.config.travelHardMinutes} are very long. ${first} still counts toward the shift.` });
        break;
      }
      case "consecutive-days":
        out.push({ rule: r.ruleId, tone: "warn", sentence: `${who} would work ${r.detail?.toLowerCase().replace(/^day /, "day ") || "too many days in a row"}`, detail: `The limit is ${state.config.maxConsecutiveDays} days in a row. ${first} still counts toward the shift.` });
        break;
      default: out.push({ rule: r.ruleId, tone: "warn", sentence: `${who}: ${r.detail || r.ruleId}`, detail: "" });
    }
  }
  return out.sort((x, y) => (x.tone === y.tone ? 0 : x.tone === "bad" ? -1 : 1));
}

/** The sentences for a list of problems: the first one is the headline, so only its detail is added; later ones bring their own sentence. */
function problemLines(ps: Problem[]): string[] {
  const out: string[] = [];
  ps.forEach((p, i) => { if (i > 0) out.push(`${p.sentence}.`); if (p.detail) out.push(p.detail); });
  return out;
}

/** "14 people could cover. The best fit is Fenn Ritter, who is free that day." Only for a day still ahead. */
function coverLine(state: DomainState, storeId: string, date: ISODate, asOf: ISODate): string | null {
  if (date < asOf) return null;
  const options = choicesFor(state, storeId, date, asOf).filter((c) => c.counts && !c.unavailable);
  if (!options.length) return "Nobody is free to cover it.";
  const best = options[0]!;
  const name = state.pharmacists[best.pharmacistId]?.name ?? best.pharmacistId;
  const how = best.currently === "off" ? "who is free that day" : `who is at ${state.stores[best.currently.split(",")[0]!]?.code ?? best.currently} that day${best.leavesShort ? " (moving them would leave that store short)" : ""}`;
  return `${options.length} ${n(options.length, "pharmacist", "pharmacists")} could cover. The best fit is ${name}, ${how}${best.travelMinutes ? `, ${best.travelMinutes} minutes away` : ""}.`;
}

function explainStoreDay(state: DomainState, ev: Evaluation, storeId: string, date: ISODate, asOf: ISODate): Explain {
  const st = state.stores[storeId]!;
  const v = buildCellView(state, ev, storeId, date);
  const look = storeLook(v, date < asOf, false);
  const context = `${st.name} (${st.code}) · ${longDate(date)}`;
  const placed = Object.values(state.assignments).filter((a) => a.storeId === storeId && a.date === date).sort((a, b) => a.placedSeq - b.placedSeq);
  const nameOf = (id: string) => state.pharmacists[id]?.name ?? id;
  const more: string[] = [];
  let headline = "";
  let mark: MarkKind | null = look.chip;
  let tone: Explain["tone"] = look.iconTone === "bad" ? "bad" : look.iconTone === "warn" ? "warn" : "ok";
  const issues = placed.flatMap((a) => problemsOf(state, ev, a));
  const counted = ev.cells[`${storeId}|${date}`]?.covered ?? 0;
  const hereLine = placed.length ? stop(`Scheduled here: ${list(placed.map((a) => nameOf(a.pharmacistId)))}`) : "Nobody is scheduled here.";

  if (v.closed && !placed.length) {
    const note = state.dateOverrides[`${storeId}|${date}`]?.note;
    return { mark: null, tone: "ok", headline: `${st.name} is closed`, context, more: [note ? `Closed that day: ${note}.` : `${st.name} does not open on ${DAYS[weekday(date)]}s.`] };
  }
  if (v.open > 0) {
    headline = `${st.name} needs ${v.open} more ${n(v.open, "pharmacist", "pharmacists")}`;
    more.push(v.required > 1 ? `${v.required - v.open} of ${v.required} needed are covered. ${hereLine}` : hereLine);
    more.push(...problemLines([{ rule: "", tone: "bad", sentence: "", detail: "" }, ...issues]).map((x) => x));
    const cl = coverLine(state, storeId, date, asOf);
    if (cl) more.push(cl);
    mark = "open"; tone = "bad";
  } else if (issues.length) {
    headline = issues[0]!.sentence;
    more.push(...problemLines(issues));
    more.push(`The shift itself is covered: ${counted} of ${v.required} needed. ${hereLine}`);
    mark = RULE_MARK[issues[0]!.rule] ?? mark; tone = issues[0]!.tone;
  } else if (look.chip === "unverified") {
    headline = `Some checks for ${st.name} can't be finished`; mark = "unverified"; tone = "warn";
    more.push("A licence or drive time for someone here is not recorded, so the schedule cannot confirm they are allowed to work this shift. Add it in Setup.", hereLine);
  } else if (look.chip === "unconfirmed") {
    const names = placed.filter((a) => !a.agreed).map((a) => nameOf(a.pharmacistId));
    headline = `${list(names) || "Someone"} has not confirmed ${st.name}`; mark = "unconfirmed"; tone = "warn";
    more.push(`${list(names)} ${names.length === 1 ? "has" : "have"} been placed but ${names.length === 1 ? "has" : "have"} not agreed to this shift yet. The shift counts as covered until they say no.`, hereLine);
  } else {
    headline = placed.length ? `${st.name} is covered` : `${st.name} needs nobody`;
    more.push(hereLine);
    if (v.acceptedShort > 0) more.push(`You chose to run ${v.acceptedShort} short on purpose.`);
    if (v.locum > 0) more.push(v.locum > 1 ? `${v.locum} locums cover this day.` : "A locum covers this day.");
    tone = "ok";
  }
  return { mark, tone, headline, context, more: more.filter(Boolean) };
}

function explainPersonDay(state: DomainState, ev: Evaluation, pid: string, date: ISODate, asOf: ISODate): Explain {
  const p = state.pharmacists[pid]!;
  const placed = Object.values(state.assignments).filter((a) => a.pharmacistId === pid && a.date === date).sort((a, b) => a.placedSeq - b.placedSeq);
  const context = `${p.name} · ${longDate(date)}`;
  const base = p.baseStoreId ? state.stores[p.baseStoreId] : undefined;
  const code = (id: string) => state.stores[id]?.code ?? id;
  const homeLine = `${p.name.split(" ")[0]}'s home store is ${base ? `${base.name} (${base.code})` : "not recorded"}${p.licenses ? `, licensed in ${list(Object.keys(p.licenses).sort()) || "no state"}` : ""}.`;
  if (!placed.length) return { mark: null, tone: "ok", headline: `${p.name} is not scheduled`, context, more: [homeLine] };
  const issues = date < asOf ? [] : placed.flatMap((a) => problemsOf(state, ev, a));
  const where = list(placed.map((a) => state.stores[a.storeId]?.name ?? code(a.storeId)));
  if (issues.length) return { mark: RULE_MARK[issues[0]!.rule] ?? null, tone: issues[0]!.tone, headline: issues[0]!.sentence, context, more: [...problemLines(issues), ...(issues.some((i) => (i.sentence + i.detail).includes(where)) ? [] : [`Scheduled at ${where}.`]), homeLine] };
  return { mark: null, tone: "ok", headline: `${p.name} works at ${where}`, context, more: [homeLine] };
}
