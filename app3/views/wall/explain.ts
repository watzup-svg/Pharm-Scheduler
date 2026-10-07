// What is going on in one store-day (or one person-day), said in plain words for the header band: a headline, a line of context, and the
// people involved with what is true of each. Pure; the same facts the colours and pictures on the wall come from (see storeLook in model.ts).
import { weekday, type DomainState, type Evaluation, type ISODate } from "@domain";
import { buildCellView } from "../../derive.ts";
import type { MarkKind, MarkTone } from "../../ui/icons.tsx";
import { RULE_MARK } from "../../ui/icons.tsx";
import { storeLook } from "./model.ts";

export type Involved = { name: string; note: string; tone: MarkTone | "ok" };
export type Explain = {
  /** The picture, or null for "all is well". */
  mark: MarkKind | null;
  /** Colour of the band's big chip: red, yellow, green. */
  tone: "bad" | "warn" | "ok";
  headline: string;
  /** Store, weekday and date. */
  context: string;
  /** Other things also wrong in the same place, one short line each. */
  more: string[];
  people: Involved[];
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

/** One sentence per thing wrong with one placement, worst first. */
function problemsOf(state: DomainState, ev: Evaluation, a: { id: string; pharmacistId: string; storeId: string; date: ISODate }) {
  const st = state.stores[a.storeId];
  const who = state.pharmacists[a.pharmacistId]?.name ?? a.pharmacistId;
  const code = st?.code ?? a.storeId;
  const out: { rule: string; sentence: string; note: string; tone: "bad" | "warn" }[] = [];
  for (const r of ev.assignments[a.id]?.results ?? []) {
    if (r.verdict !== "Fail" || r.overridden) continue;
    switch (r.ruleId) {
      case "licensing": out.push({ rule: r.ruleId, sentence: `${who} is not licensed for ${st?.state ? `${st.state} ` : ""}${code}`, note: `Not licensed${st?.state ? ` in ${st.state}` : ""}. Does not count`, tone: "bad" }); break;
      case "availability": { const w = whyAway(state, a.pharmacistId, a.date, a.storeId); out.push({ rule: r.ruleId, sentence: `${who} is scheduled at ${code} but is ${w.phrase}${w.when ? ` (${w.when})` : ""}`, note: `${w.phrase[0]!.toUpperCase()}${w.phrase.slice(1)}${w.when ? `, ${w.when}` : ""}${w.note ? ` · ${w.note}` : ""}. Does not count`, tone: "bad" }); break; }
      case "double-booking": {
        const others = Object.values(state.assignments).filter((x) => x.id !== a.id && x.pharmacistId === a.pharmacistId && x.date === a.date).map((x) => state.stores[x.storeId]?.code ?? x.storeId);
        out.push({ rule: r.ruleId, sentence: `${who} is booked at two stores: ${[code, ...others].join(" and ")}`, note: `Also at ${others.join(", ") || "another store"}. Does not count`, tone: "bad" });
        break;
      }
      case "closure": out.push({ rule: r.ruleId, sentence: `${who} is placed at ${st?.name ?? code}, which is closed that day`, note: "Store is closed. Does not count", tone: "bad" }); break;
      case "travel-hard": case "travel-soft": out.push({ rule: r.ruleId, sentence: `${who} has a ${r.ruleId === "travel-hard" ? "very " : ""}long drive to ${code} (${(/\d+/.exec(r.detail || "") ?? [""])[0] ? `${(/\d+/.exec(r.detail))![0]} minutes` : "over the limit"})`, note: `${r.detail || "Long drive"}. Still counts`, tone: "warn" }); break;
      case "consecutive-days": out.push({ rule: r.ruleId, sentence: `${who} would work ${r.detail?.toLowerCase().replace(/^day /, "day ") || "too many days in a row"}`, note: `${r.detail || "Many days in a row"}. Still counts`, tone: "warn" }); break;
      default: out.push({ rule: r.ruleId, sentence: `${who}: ${r.detail || r.ruleId}`, note: r.detail || r.ruleId, tone: "warn" });
    }
  }
  return out.sort((x, y) => (x.tone === y.tone ? 0 : x.tone === "bad" ? -1 : 1));
}

function explainStoreDay(state: DomainState, ev: Evaluation, storeId: string, date: ISODate, asOf: ISODate): Explain {
  const st = state.stores[storeId]!;
  const v = buildCellView(state, ev, storeId, date);
  const look = storeLook(v, date < asOf, false);
  const context = `${st.name} (${st.code}) · ${longDate(date)}`;
  const placed = Object.values(state.assignments).filter((a) => a.storeId === storeId && a.date === date).sort((a, b) => a.placedSeq - b.placedSeq);
  const nameOf = (id: string) => state.pharmacists[id]?.name ?? id;
  const people: Involved[] = [];
  const more: string[] = [];
  let headline = "";
  let mark: MarkKind | null = look.chip;
  let tone: Explain["tone"] = look.iconTone === "bad" ? "bad" : look.iconTone === "warn" ? "warn" : "ok";

  const issues = placed.flatMap((a) => problemsOf(state, ev, a).map((p) => ({ ...p, a })));
  for (const a of placed) {
    const ps = issues.filter((i) => i.a.id === a.id);
    const counts = ev.assignments[a.id]?.counts ?? false;
    const note = ps.length ? ps[0]!.note : !a.agreed ? "Not confirmed yet" : a.pinned ? "Pinned in place" : a.partialNote ? `Part day: ${a.partialNote}` : counts ? "Working" : "Does not count";
    people.push({ name: nameOf(a.pharmacistId), note, tone: ps[0]?.tone ?? (!a.agreed ? "warn" : "ok") });
  }

  if (v.closed && !placed.length) {
    return { mark: null, tone: "ok", headline: `${st.name} is closed`, context, more: [], people: [] };
  }
  if (v.open > 0) {
    const got = v.required - v.open;
    headline = `${st.name} needs ${v.open} more ${n(v.open, "pharmacist", "pharmacists")}`;
    if (v.required > 1) more.push(`${got} of ${v.required} are here`);
    else if (!placed.length) more.push("Nobody is scheduled");
    for (const i of issues) more.push(i.sentence);
    mark = "open"; tone = "bad";
  } else if (issues.length) {
    headline = issues[0]!.sentence;
    for (const i of issues.slice(1)) more.push(i.sentence);
    mark = RULE_MARK[issues[0]!.rule] ?? mark; tone = issues[0]!.tone;
    if (v.required > 0 && (ev.cells[`${storeId}|${date}`]?.covered ?? 0) >= v.required) more.unshift("The shift itself is covered");
  } else if (look.chip === "unverified") {
    headline = `Some checks for ${st.name} can't be finished`; more.push("A licence or drive time isn't recorded"); mark = "unverified"; tone = "warn";
  } else if (look.chip === "unconfirmed") {
    headline = `${placed.filter((a) => !a.agreed).map((a) => nameOf(a.pharmacistId)).join(" and ") || "Someone"} has not confirmed ${st.name}`; mark = "unconfirmed"; tone = "warn";
  } else {
    headline = placed.length ? `${st.name} is covered` : `${st.name} needs nobody`;
    if (v.acceptedShort > 0) more.push(`Running ${v.acceptedShort} short on purpose`);
    if (v.locum > 0) more.push(v.locum > 1 ? `${v.locum} locums cover` : "A locum covers");
    tone = "ok";
  }
  return { mark, tone, headline, context, more, people };
}

function explainPersonDay(state: DomainState, ev: Evaluation, pid: string, date: ISODate, asOf: ISODate): Explain {
  const p = state.pharmacists[pid]!;
  const placed = Object.values(state.assignments).filter((a) => a.pharmacistId === pid && a.date === date).sort((a, b) => a.placedSeq - b.placedSeq);
  const context = `${p.name} · ${longDate(date)}`;
  if (!placed.length) return { mark: null, tone: "ok", headline: `${p.name} is not scheduled`, context, more: [], people: [] };
  const code = (id: string) => state.stores[id]?.code ?? id;
  const issues = date < asOf ? [] : placed.flatMap((a) => problemsOf(state, ev, a));
  const people: Involved[] = placed.map((a) => ({ name: state.stores[a.storeId]?.name ?? code(a.storeId), note: problemsOf(state, ev, a)[0]?.note ?? "Working", tone: problemsOf(state, ev, a)[0]?.tone ?? "ok" }));
  if (issues.length) return { mark: RULE_MARK[issues[0]!.rule] ?? null, tone: issues[0]!.tone, headline: issues[0]!.sentence, context, more: issues.slice(1).map((i) => i.sentence), people };
  return { mark: null, tone: "ok", headline: `${p.name} works at ${placed.map((a) => state.stores[a.storeId]?.name ?? code(a.storeId)).join(" and ")}`, context, more: [], people };
}
