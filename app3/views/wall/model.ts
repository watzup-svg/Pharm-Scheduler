// Pure helpers for the wall: dates, windows, rows and the per-cell models the grid draws.
import {
  addDays, cmp, daysInMonth, toDayNumber, weekday, RULE_BY_ID,
  type Assignment, type DomainState, type Evaluation, type ISODate, type Pharmacist, type Store,
} from "@domain";
import { buildCellView, type CellView } from "../../derive.ts";
import { RULE_MARK, type MarkKind, type MarkTone } from "../../ui/icons.tsx";
import type { Ghost } from "../../derive.ts";

export const DOW_LETTER = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export const monthIndex = (d: ISODate) => Number(d.slice(5, 7)) - 1;
export const dayNum = (d: ISODate) => Number(d.slice(8, 10));
/** "Tue Oct 6" */
export const niceDate = (d: ISODate) => `${DOW_SHORT[weekday(d)]} ${MONTH_SHORT[monthIndex(d)]} ${dayNum(d)}`;
export const rangeText = (from: ISODate, to: ISODate) => {
  const same = from.slice(0, 4) === to.slice(0, 4);
  const a = `${MONTH_SHORT[monthIndex(from)]} ${dayNum(from)}${same ? "" : `, ${from.slice(0, 4)}`}`;
  return `${a} – ${MONTH_SHORT[monthIndex(to)]} ${dayNum(to)}, ${to.slice(0, 4)}`;
};

// ---------- window choices ----------
export type WidthKind = "2w" | "4w" | "month" | "custom";
export const sundayOf = (d: ISODate): ISODate => addDays(d, -weekday(d));
export function monthWindowOf(d: ISODate): { from: ISODate; to: ISODate } {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return { from: `${d.slice(0, 7)}-01`, to: `${d.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}` };
}
export function windowFor(kind: Exclude<WidthKind, "custom">, asOf: ISODate): { from: ISODate; to: ISODate } {
  if (kind === "month") return monthWindowOf(asOf);
  const from = sundayOf(asOf);
  return { from, to: addDays(from, kind === "2w" ? 13 : 27) };
}
export function widthKind(w: { from: ISODate; to: ISODate }): WidthKind {
  const m = monthWindowOf(w.from);
  if (m.from === w.from && m.to === w.to) return "month";
  const len = toDayNumber(w.to) - toDayNumber(w.from) + 1;
  return len === 14 ? "2w" : len === 28 ? "4w" : "custom";
}

// ---------- rows ----------
export function activeStores(state: DomainState, win: { from: ISODate; to: ISODate }): Store[] {
  return Object.values(state.stores)
    .filter((s) => (!s.activeFrom || s.activeFrom <= win.to) && (!s.inactiveFrom || s.inactiveFrom > win.from))
    .sort((a, b) => cmp(a.code, b.code) || cmp(a.id, b.id));
}
export function activePharmacists(state: DomainState, win: { from: ISODate; to: ISODate }): Pharmacist[] {
  return Object.values(state.pharmacists)
    .filter((p) => (!p.activeFrom || p.activeFrom <= win.to) && (!p.inactiveFrom || p.inactiveFrom > win.from))
    .sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id));
}
/** Full name when it fits, otherwise first initial + last name. */
export function shortName(name: string, max = 15): string {
  if (name.length <= max) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]![0]}. ${parts[parts.length - 1]}`;
}

export function indexByCell(state: DomainState): Map<string, Assignment[]> {
  const m = new Map<string, Assignment[]>();
  for (const a of Object.values(state.assignments)) {
    const k = `${a.storeId}|${a.date}`;
    const l = m.get(k);
    if (l) l.push(a); else m.set(k, [a]);
  }
  return m;
}
export function indexByPharmacist(state: DomainState): Map<string, Assignment[]> {
  const m = new Map<string, Assignment[]>();
  for (const a of Object.values(state.assignments)) {
    const k = `${a.pharmacistId}|${a.date}`;
    const l = m.get(k);
    if (l) l.push(a); else m.set(k, [a]);
  }
  return m;
}

// ---------- cell models ----------
export type Marker = "serious" | "warning" | "info" | null;
export type Chip = {
  key: string;
  text: string;
  kind: "in" | "add" | "rem";
  /** Unconfirmed: italic with a dashed underline. */
  unconfirmed: boolean;
  /** Does not count (a presence rule fails): struck through, in brick. */
  struck: boolean;
  pinned: boolean;
  half: boolean;
  assignmentId?: string;
  pharmacistId: string;
  /** Plain words for the tooltip and the accessible name. */
  words: string;
};
export type Block = "good" | "open" | "closed" | "away" | "req" | "none";
export type CellModel = {
  axis: "store" | "pharmacist";
  r: number;
  c: number;
  date: ISODate;
  storeId?: string;
  pharmacistId?: string;
  past: boolean;
  weekend: boolean;
  asOfCol: boolean;
  closed: boolean;
  /** Pharmacist axis: the store codes (and ghosts). Store axis: always empty, the wall shows no initials there. */
  chips: Chip[];
  open: number;
  short: number;
  locum: number;
  marker: Marker;
  /** Pharmacist axis only. */
  word?: "OFF" | "Req" | "–";
  hatchedAway?: boolean;
  label: string;
  /** Can the block be dragged from here (store axis, live wall, exactly one person placed)? */
  hasDrag: boolean;
  /** The assignment the block carries when dragged. */
  dragAid?: string;
  /** What colour the block is. Colour follows coverage only: good = covered, open = needs cover, closed = hatch, away / req = time off (people axis). */
  block: Block;
  /** The one picture on the block (worst unresolved issue first), its severity colour, and the count (open spots, only when more than one). Null when all is good, and on past days. */
  chip: MarkKind | null;
  iconTone: MarkTone | null;
  chipN: number;
  /** Two-person stores: "1/2", only while not fully covered. */
  frac: string | null;
  /** Live placements, and what a preview would add or remove. */
  people: number;
  ghostAdd: number;
  ghostRem: number;
  /** Full names placed (store axis), the first thing wrong in words, for the Day view. */
  names: string[];
  reason: string;
  /** Hover note: "Title | line | line". */
  tip: string;
  tone: "bad" | "off" | "ok" | "plain";
};

const RULE_WORDS: Record<string, string> = {
  availability: "is away that day", closure: "is on a closed day", "double-booking": "is booked at two stores",
  licensing: "is not licensed here", "consecutive-days": "has worked many days in a row", "travel-soft": "has a long drive", "travel-hard": "has a very long drive",
};
/** Presence rules first, in the order the DM would want them named. */
const BLOCK_ORDER = ["licensing", "availability", "double-booking", "closure"];
const MARK_WORD = { serious: "problem", warning: "warning", info: "to check" } as const;

/** What a store-day looks like, from the evaluation alone. Pure: colour = coverage; the picture = the worst thing still unresolved. */
export type StoreLook = { block: Block; chip: MarkKind | null; iconTone: MarkTone | null; chipN: number; frac: string | null };

export function storeLook(v: CellView, past: boolean, covering: boolean): StoreLook {
  const live = v.assignments;
  const blockRules = live.flatMap((a) => a.blocks);
  const blockRule = BLOCK_ORDER.find((r) => blockRules.includes(r)) ?? blockRules[0];
  const warnRule = live.flatMap((a) => a.warns)[0];
  let look: StoreLook;
  if (v.closed) {
    // A hatch. A name on a closed day is a broken rule that still shows.
    look = { block: "closed", chip: live.length ? (blockRule ? RULE_MARK[blockRule] ?? "closure" : "closure") : null, iconTone: live.length ? "bad" : null, chipN: 0, frac: null };
  } else if (v.open > 0) {
    const got = v.required - v.open;
    look = { block: "open", chip: "open", iconTone: "bad", chipN: v.open, frac: v.required > 1 && got > 0 ? `${got}/${v.required}` : null };
  } else if (blockRule) {
    look = { block: "good", chip: RULE_MARK[blockRule] ?? "double", iconTone: "bad", chipN: 0, frac: null };
  } else if (warnRule) {
    look = { block: "good", chip: RULE_MARK[warnRule] ?? "drive", iconTone: "warn", chipN: 0, frac: null };
  } else if (live.some((a) => a.unverified)) {
    look = { block: "good", chip: "unverified", iconTone: "warn", chipN: 0, frac: null };
  } else if (live.some((a) => !a.agreed)) {
    look = { block: "good", chip: "unconfirmed", iconTone: "warn", chipN: 0, frac: null };
  } else {
    const quiet: MarkKind | null = v.acceptedShort > 0 ? "short" : v.locum > 0 ? "locum" : live.some((a) => a.pinned) ? "pinned" : covering ? "covering" : null;
    look = { block: "good", chip: quiet, iconTone: quiet ? "quiet" : null, chipN: 0, frac: null };
  }
  // Past days carry no problem pictures (nothing can be done about them) and no counts.
  if (past) return { ...look, chip: null, iconTone: null, chipN: 0, frac: null };
  return look;
}

/** Plain sentences about one cell: what is wrong, what was accepted. Used by the hover note, the accessible name and the Day view. */
function storeFacts(state: DomainState, v: CellView): { problems: string[]; accepted: string[]; notes: string[] } {
  const problems: string[] = [];
  const accepted: string[] = [];
  const notes: string[] = [];
  for (const a of v.assignments) {
    for (const r of a.blocks) problems.push(`${a.name} ${RULE_WORDS[r] ?? r}, so does not count`);
    for (const r of a.warns) problems.push(`${a.name} ${RULE_WORDS[r] ?? r}`);
    if (a.unverified) problems.push(`${a.name} could not be fully checked (a licence or drive time is not recorded)`);
    if (!a.agreed) notes.push(`${a.name} has not confirmed yet`);
    for (const r of a.overridden) accepted.push(`${a.name} ${RULE_WORDS[r] ?? r}`);
    if (a.partialNote) notes.push(`${a.name}: part day, ${a.partialNote}`);
    if (a.pinned) notes.push(`${a.name} is pinned`);
    const base = state.pharmacists[a.pharmacistId]?.baseStoreId;
    if (a.counts && base && base !== v.storeId) notes.push(`${a.name} is covering from ${state.stores[base]?.code ?? base}`);
  }
  if (v.acceptedShort) notes.push(`${v.acceptedShort} accepted short`);
  if (v.locum) notes.push(v.locum > 1 ? `${v.locum} locums cover` : "A locum covers");
  return { problems, accepted, notes };
}

export function buildStoreModels(
  state: DomainState, ev: Evaluation, stores: Store[], dates: ISODate[], asOf: ISODate,
  byCell: Map<string, Assignment[]>, ghosts: Map<string, Ghost>, readOnly: boolean,
): CellModel[][] {
  return stores.map((s, r) => dates.map((date, c) => {
    const v = buildCellView(state, ev, s.id, date, byCell);
    const g = ghosts.get(`${s.id}|${date}`);
    const past = date < asOf;
    const base = state.pharmacists;
    const covering = v.assignments.some((a) => a.counts && base[a.pharmacistId]?.baseStoreId && base[a.pharmacistId]!.baseStoreId !== s.id);
    const look = storeLook(v, past, covering);
    const names = v.assignments.map((a) => a.name);
    const facts = storeFacts(state, v);
    const status = v.closed ? (v.assignments.length ? "closed, but someone is placed" : "closed") : v.open > 0 ? `needs ${v.open} more` : "covered";
    const addNames = (g?.add ?? []).map((id) => state.pharmacists[id]?.name ?? id);
    const remNames = (g?.remove ?? []).map((id) => state.pharmacists[id]?.name ?? id);
    // The accessible name is a full sentence: who, what is wrong, what a preview would change.
    const said: string[] = [status];
    if (names.length) said.push(`${v.closed || v.open > 0 ? "placed" : "covered by"} ${names.join(" and ")}`);
    if (!past) said.push(...facts.problems);
    said.push(...facts.notes);
    if (addNames.length) said.push(`preview would add ${addNames.join(" and ")}`);
    if (remNames.length) said.push(`preview would remove ${remNames.join(" and ")}`);
    if (past) said.push("past");
    const label = `${s.code}, ${niceDate(date)}: ${said.join(", ")}`;
    // Hover note: names, then reasons. The facts are all in the Inspector too.
    const lines: string[] = [];
    if (names.length) lines.push(names.join(", "));
    else lines.push(v.closed ? "Closed" : "Nobody placed");
    if (v.open > 0) lines.push(`Needs ${v.open} more${v.required > 1 ? ` of ${v.required}` : ""}`);
    if (!past) lines.push(...facts.problems.slice(0, 3));
    lines.push(...facts.notes.slice(0, 2));
    if (facts.accepted.length) lines.push(`Accepted: ${facts.accepted.slice(0, 2).join("; ")}`);
    if (addNames.length) lines.push(`Preview adds ${addNames.join(", ")}`);
    if (remNames.length) lines.push(`Preview removes ${remNames.join(", ")}`);
    const tip = [`${s.code} · ${niceDate(date)}`, ...lines.slice(0, 6), "Open this day"].join(" | ");
    const reason = past ? "" : facts.problems[0] ?? (v.open > 0 ? `Needs ${v.open} more` : "");
    const one = v.assignments.length === 1 ? v.assignments[0]! : null;
    return {
      axis: "store", r, c, date, storeId: s.id, past, weekend: isWeekend(date), asOfCol: date === asOf, closed: v.closed,
      chips: [], open: v.open, short: v.acceptedShort, locum: v.locum, marker: v.marker,
      label, hasDrag: !readOnly && !!one, ...(one ? { dragAid: one.id } : {}),
      block: look.block, chip: look.chip, iconTone: look.iconTone, chipN: look.chipN, frac: look.frac,
      people: v.assignments.length, ghostAdd: addNames.length, ghostRem: remNames.length, names, reason,
      tip, tone: look.iconTone === "bad" || (!past && v.open > 0) ? "bad" : look.iconTone === "warn" ? "off" : "plain",
    } satisfies CellModel;
  }));
}

export const isWeekend = (d: ISODate) => { const w = weekday(d); return w === 0 || w === 6; };

type Absence = { first: ISODate; last: ISODate; status: "Requested" | "Approved" | "Actual" };

export function buildPharmacistModels(
  state: DomainState, ev: Evaluation, people: Pharmacist[], dates: ISODate[], asOf: ISODate,
  byPD: Map<string, Assignment[]>, ghosts: Map<string, Ghost>, includeRequested: boolean,
): CellModel[][] {
  const away = new Map<string, Absence[]>();
  for (const u of Object.values(state.unavailability)) {
    if (u.scopeStoreId) continue; // a turned-down store is not an absence
    if (u.status === "Approved" || u.status === "Actual" || (includeRequested && u.status === "Requested")) {
      const l = away.get(u.pharmacistId) ?? [];
      l.push({ first: u.first, last: u.last, status: u.status });
      away.set(u.pharmacistId, l);
    }
  }
  // ghosts by pharmacist + date
  const gAdd = new Map<string, string[]>();
  const gRem = new Map<string, string[]>();
  for (const [k, g] of ghosts) {
    const [sid, date] = k.split("|") as [string, string];
    for (const p of g.add) { const kk = `${p}|${date}`; gAdd.set(kk, [...(gAdd.get(kk) ?? []), sid]); }
    for (const p of g.remove) { const kk = `${p}|${date}`; gRem.set(kk, [...(gRem.get(kk) ?? []), sid]); }
  }
  const code = (id: string) => state.stores[id]?.code ?? id;
  return people.map((p, r) => dates.map((date, c) => {
    const past = date < asOf;
    const base = { axis: "pharmacist" as const, r, c, date, pharmacistId: p.id, past, weekend: isWeekend(date), asOfCol: date === asOf, closed: false, open: 0, short: 0, locum: 0, hasDrag: false, block: "none" as Block, chip: null as MarkKind | null, iconTone: null as MarkTone | null, chipN: 0, frac: null as string | null, people: 0, ghostAdd: 0, ghostRem: 0, names: [] as string[], reason: "", tip: "", tone: "plain" as CellModel["tone"] };
    const active = (!p.activeFrom || p.activeFrom <= date) && (!p.inactiveFrom || p.inactiveFrom > date);
    if (!active) return { ...base, chips: [], marker: null, label: `${p.name}, ${niceDate(date)}: not working here`, tip: `${p.name} · ${niceDate(date)} | Not working here yet` } satisfies CellModel;
    const list = (byPD.get(`${p.id}|${date}`) ?? []).slice().sort((a, b) => a.placedSeq - b.placedSeq || cmp(a.id, b.id));
    const rem = new Set(gRem.get(`${p.id}|${date}`) ?? []);
    const chips: Chip[] = list.map((a) => {
      const e = ev.assignments[a.id];
      const struck = e ? !e.counts : false;
      const isRem = rem.has(a.storeId);
      return {
        key: a.id, text: code(a.storeId), kind: isRem ? "rem" : "in", unconfirmed: !a.agreed, struck, pinned: a.pinned, half: !!a.partialNote,
        assignmentId: a.id, pharmacistId: p.id, words: `${code(a.storeId)}${a.agreed ? "" : ", not confirmed"}${struck ? ", does not count" : ""}${isRem ? ", would be removed" : ""}`,
      } satisfies Chip;
    });
    for (const sid of gAdd.get(`${p.id}|${date}`) ?? []) {
      chips.push({ key: `+${sid}`, text: code(sid), kind: "add", unconfirmed: false, struck: false, pinned: false, half: false, pharmacistId: p.id, words: `${code(sid)}, would be added` });
    }
    const live = chips.filter((ch) => ch.kind !== "add");
    const abs = (away.get(p.id) ?? []).filter((a) => a.first <= date && date <= a.last);
    const absStatus = abs.some((a) => a.status !== "Requested") ? "OFF" : abs.length ? "Req" : null;
    let marker: Marker = null;
    const fails = list.flatMap((a) => (ev.assignments[a.id]?.results ?? []).filter((x) => x.verdict === "Fail" && !x.overridden));
    if (live.length > 1 || fails.some((x) => RULE_BY_ID[x.ruleId]?.kind === "presence") || (absStatus === "OFF" && live.length > 0)) marker = "serious";
    else if (fails.length) marker = "warning";
    let word: CellModel["word"];
    let label: string;
    const where = chips.map((ch) => (ch.kind === "add" ? `${ch.text} would be added` : ch.kind === "rem" ? `${ch.text} would be removed` : ch.text)).join(" and ");
    if (!chips.length) {
      word = absStatus ?? "–";
      label = `${p.name}, ${niceDate(date)}: ${absStatus === "OFF" ? "away (approved)" : absStatus === "Req" ? "away requested, not approved" : "not scheduled"}`;
    } else {
      label = `${p.name}, ${niceDate(date)}: at ${where}${live.length > 1 ? ", booked in two places" : ""}${absStatus === "OFF" ? ", but away" : ""}${marker ? `, ${MARK_WORD[marker]}` : ""}`;
    }
    const failIds = fails.map((x) => x.ruleId);
    const presenceFail = fails.find((x) => RULE_BY_ID[x.ruleId]?.kind === "presence");
    const policyFail = fails.find((x) => RULE_BY_ID[x.ruleId]?.kind === "policy");
    const baseStore = p.baseStoreId;
    const awayFromBase = live.length > 0 && !!baseStore && list.some((a) => a.storeId !== baseStore);
    // The one picture: a broken rule (red), then a warning (amber), then "away from home" (quiet). Past days carry none.
    let chip: MarkKind | null = null;
    let iconTone: MarkTone | null = null;
    if (live.length > 1) { chip = "double"; iconTone = "bad"; }
    else if (absStatus === "OFF" && live.length) { chip = "away"; iconTone = "bad"; }
    else if (presenceFail) { chip = RULE_MARK[presenceFail.ruleId] ?? "double"; iconTone = "bad"; }
    else if (policyFail) { chip = RULE_MARK[policyFail.ruleId] ?? "drive"; iconTone = "warn"; }
    else if (awayFromBase) { chip = "covering"; iconTone = "quiet"; }
    if (past) { chip = null; iconTone = null; }
    const block: Block = absStatus === "OFF" ? "away" : chips.length ? "good" : absStatus === "Req" ? "req" : "none";
    const tfacts: string[] = [];
    if (live.length > 1) tfacts.push(`Booked at ${live.map((x) => x.text).join(" and ")}`);
    else if (live.length) tfacts.push(`At ${live[0]!.text}${live[0]!.unconfirmed ? " (not confirmed)" : ""}`);
    if (absStatus === "OFF") tfacts.push(live.length ? "Away that day, does not count" : "Away (approved)");
    else if (absStatus === "Req") tfacts.push("Away requested, not decided");
    if (!past) for (const id of failIds) if (id !== "double-booking" && id !== "availability") tfacts.push(RULE_WORDS[id] ? `Rule: ${RULE_WORDS[id]}` : id);
    if (awayFromBase && !past) tfacts.push("Working away from home store");
    if (!tfacts.length) tfacts.push("Not scheduled");
    const tip = [`${p.name} · ${niceDate(date)}`, ...tfacts.slice(0, 3), ...(live.length ? ["Open this day"] : [])].join(" | ");
    return { ...base, chips, marker, word, hatchedAway: block === "away", label, block, chip, iconTone, people: live.length, ghostAdd: chips.filter((x) => x.kind === "add").length, ghostRem: chips.filter((x) => x.kind === "rem").length, tip, tone: iconTone === "bad" ? "bad" as const : iconTone === "warn" ? "off" as const : "plain" as const } satisfies CellModel;
  }));
}

/** Open spots per store from asOf on, for the row label. */
export function openByStore(ev: Evaluation, stores: Store[], win: { from: ISODate; to: ISODate }, asOf: ISODate): Map<string, number> {
  const m = new Map<string, number>();
  const ids = new Set(stores.map((s) => s.id));
  for (const c of Object.values(ev.cells)) {
    if (c.date < asOf || c.date < win.from || c.date > win.to || !ids.has(c.storeId) || c.open <= 0) continue;
    m.set(c.storeId, (m.get(c.storeId) ?? 0) + c.open);
  }
  return m;
}

/** Hex status for a row: any open spot or problem from today on = needs fixing; all closed = closed; else covered. */
export function rowStatus(cells: CellModel[], asOf: ISODate): "ok" | "fix" | "closed" {
  if (cells.every((c) => c.closed && c.people === 0)) return "closed";
  return cells.some((c) => c.date >= asOf && (c.open > 0 || c.marker === "serious")) ? "fix" : "ok";
}
