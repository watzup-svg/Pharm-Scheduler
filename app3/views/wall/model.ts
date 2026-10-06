// Pure helpers for the wall: dates, windows, rows and the per-cell models the grid draws.
import {
  addDays, cmp, daysInMonth, toDayNumber, weekday, RULE_BY_ID,
  type Assignment, type DomainState, type Evaluation, type ISODate, type Pharmacist, type Store,
} from "@domain";
import { buildCellView } from "../../derive.ts";
import type { Ghost } from "../../derive.ts";

export const DOW_LETTER = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
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
  chips: Chip[];
  open: number;
  short: number;
  locum: number;
  marker: Marker;
  /** Pharmacist axis only. */
  word?: "OFF" | "Req" | "–";
  hatchedAway?: boolean;
  label: string;
  /** Can an initials chip be dragged from here (store axis, live wall)? */
  hasDrag: boolean;
};

const MARK_WORD = { serious: "problem", warning: "warning", info: "to check" } as const;

export function buildStoreModels(
  state: DomainState, ev: Evaluation, stores: Store[], dates: ISODate[], asOf: ISODate,
  byCell: Map<string, Assignment[]>, ghosts: Map<string, Ghost>, readOnly: boolean,
): CellModel[][] {
  return stores.map((s, r) => dates.map((date, c) => {
    const v = buildCellView(state, ev, s.id, date, byCell);
    const g = ghosts.get(`${s.id}|${date}`);
    const removed = new Set(g?.remove ?? []);
    const chips: Chip[] = v.assignments.map((a) => {
      const rem = removed.has(a.pharmacistId);
      const struck = !a.counts;
      const bits = [a.name];
      if (!a.agreed) bits.push("not confirmed");
      if (struck) bits.push("does not count");
      if (a.pinned) bits.push("pinned");
      if (a.partialNote) bits.push("part day");
      if (rem) bits.push("would be removed");
      return {
        key: a.id, text: a.initials, kind: rem ? "rem" : "in", unconfirmed: !a.agreed, struck, pinned: a.pinned, half: !!a.partialNote,
        assignmentId: a.id, pharmacistId: a.pharmacistId, words: bits.join(", "),
      } satisfies Chip;
    });
    for (const pid of g?.add ?? []) {
      const p = state.pharmacists[pid];
      chips.push({ key: `+${pid}`, text: p?.initials ?? pid, kind: "add", unconfirmed: false, struck: false, pinned: false, half: false, pharmacistId: pid, words: `${p?.name ?? pid}, would be added` });
    }
    const parts: string[] = [];
    if (v.closed && chips.length === 0) parts.push("closed");
    for (const ch of chips) parts.push(ch.kind === "add" ? `${ch.text} would be added` : ch.kind === "rem" ? `${ch.text} would be removed` : `${ch.text}${ch.unconfirmed ? " unconfirmed" : ""}${ch.struck ? " not counted" : ""}${ch.pinned ? " pinned" : ""}${ch.half ? " half day" : ""}`);
    if (v.locum) parts.push(v.locum > 1 ? `${v.locum} locums` : "locum");
    if (v.acceptedShort) parts.push(`${v.acceptedShort} accepted short`);
    if (v.open) parts.push(`needs ${v.open} more`);
    if (v.marker) parts.push(MARK_WORD[v.marker]);
    if (!parts.length) parts.push("empty");
    return {
      axis: "store", r, c, date, storeId: s.id, past: date < asOf, weekend: isWeekend(date), asOfCol: date === asOf, closed: v.closed,
      chips, open: v.open, short: v.acceptedShort, locum: v.locum, marker: v.marker,
      label: `${s.code}, ${niceDate(date)}: ${parts.join(", ")}`, hasDrag: !readOnly,
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
    const base = { axis: "pharmacist" as const, r, c, date, pharmacistId: p.id, past: date < asOf, weekend: isWeekend(date), asOfCol: date === asOf, closed: false, open: 0, short: 0, locum: 0, hasDrag: false };
    const active = (!p.activeFrom || p.activeFrom <= date) && (!p.inactiveFrom || p.inactiveFrom > date);
    if (!active) return { ...base, chips: [], marker: null, label: `${p.name}, ${niceDate(date)}: not working here` } satisfies CellModel;
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
    return { ...base, chips, marker, word, hatchedAway: absStatus === "OFF" && !chips.length, label } satisfies CellModel;
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
