import { isoDate, monthName, weekdayShort } from "./calendar.ts";
import { ptoOnDay } from "./coverage.ts";
import { getCell, namesOnStoreDay } from "./grid.ts";
import { unlicensedAt } from "./licence.ts";
import { isOpenDay, placeName } from "./place.ts";
import { personByName, RPH_SLOTS, SLOTS, namesForKindDetailed } from "./slots.ts";
import type { CellRef, Evaluation, ScheduleDoc, SlotId, SlotKind } from "./types.ts";

export type FixKind = "leftover" | "license" | "double" | "hole";

export type FixStep = {
  kind: FixKind;
  store: string;
  day: number;
  slot: SlotId;
  headline: string;
  names: string[];
  stores: string[];
};

export type WarnKind = "pto" | "solo-float";

export type WarnStep = {
  kind: WarnKind;
  store: string;
  day: number;
  slot: SlotId;
  headline: string;
  names: string[];
  stores: string[];
};

export type PickerOption = { name: string; label: string };

export type Candidate = { name: string; tag: string };

/** Store name for a sentence: "Estacada Hi-School Pharmacy" reads as "Estacada". Headers keep the full name. */
export function shortStoreName(name: string): string {
  const short = name
    .replace(/\s*\(.*?\)\s*$/, "")
    .replace(/\s+Hi-School Pharmacy$/i, "")
    .replace(/\s+Pharmacy$/i, "")
    .trim();
  return short || name;
}

export function storeLabel(doc: ScheduleDoc, code: string): string {
  const name = doc.stores.find((s) => s.code === code)?.name;
  return name ? shortStoreName(name) : code;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function weekdayDay(doc: ScheduleDoc, day: number): string {
  return `${weekdayShort(doc.year, doc.month, day)} ${monthName(doc.year, doc.month).slice(0, 3)} ${day}`;
}

function firstSlotWithName(doc: ScheduleDoc, store: string, day: number, names: string[]): SlotId {
  for (const slot of SLOTS) {
    const n = getCell(doc.grid, store, slot.id, day).trim();
    if (n && names.includes(n)) return slot.id;
  }
  return SLOTS[0]!.id;
}

function leftoverSteps(doc: ScheduleDoc, ev: Evaluation, mode: "rph" | "staff" | "all" = "all"): FixStep[] {
  const out: FixStep[] = [];
  for (const issue of ev.issues) {
    const rphHit = mode !== "staff" && issue.leftover;
    const staffHit = mode !== "rph" && issue.staffLeftover;
    if (!rphHit && !staffHit) continue;
    if (!issue.leftoverNames.length) continue;
    const names =
      mode === "rph"
        ? issue.leftoverNames.filter((n) => personByName(doc.people, n)?.role === "Pharmacist" || personByName(doc.people, n)?.role === "Float Pharmacist")
        : mode === "staff"
          ? issue.leftoverNames.filter((n) => {
              const r = personByName(doc.people, n)?.role;
              return r === "Pharmacy Technician" || r === "Cashier";
            })
          : issue.leftoverNames;
    const whoNames = names.length ? names : issue.leftoverNames;
    const who = joinAnd(whoNames);
    const store = storeLabel(doc, issue.store);
    out.push({
      kind: "leftover",
      store: issue.store,
      day: issue.day,
      slot: firstSlotWithName(doc, issue.store, issue.day, whoNames),
      headline: `${who} is scheduled at ${store} on ${weekdayDay(doc, issue.day)}, but it’s closed`,
      names: whoNames,
      stores: [issue.store],
    });
  }
  return out;
}

function licenseSteps(doc: ScheduleDoc, ev: Evaluation): FixStep[] {
  const out: FixStep[] = [];
  for (const issue of ev.issues) {
    for (const name of issue.unlicensedNames) {
      const state = unlicensedAt(doc, name, issue.store, isoDate(doc.year, doc.month, issue.day)) ?? "";
      out.push({
        kind: "license",
        store: issue.store,
        day: issue.day,
        slot: firstSlotWithName(doc, issue.store, issue.day, [name]),
        headline: `${name} isn’t licensed in ${state} but is scheduled at ${storeLabel(doc, issue.store)} on ${weekdayDay(doc, issue.day)}`,
        names: [name],
        stores: [issue.store],
      });
    }
  }
  return out;
}

function doubleSteps(doc: ScheduleDoc, ev: Evaluation): FixStep[] {
  const out: FixStep[] = [];
  const seen = new Set<string>();
  for (const issue of ev.issues) {
    for (const name of issue.doubledNames) {
      const key = `${name}|${issue.day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stores = doc.stores
        .filter((s) => namesOnStoreDay(doc.grid, s.code, issue.day).includes(name))
        .map((s) => s.code);
      if (stores.length >= 2) {
        const storeNames = stores.map((c) => storeLabel(doc, c));
        const home = stores[0]!;
        out.push({
          kind: "double",
          store: home,
          day: issue.day,
          slot: firstSlotWithName(doc, home, issue.day, [name]),
          headline: `${name} is scheduled at ${joinAnd(storeNames)} on ${weekdayDay(doc, issue.day)}`,
          names: [name],
          stores,
        });
        continue;
      }
      // Same person in both pharmacist rows of one store is still a double.
      const only = stores[0];
      if (!only) continue;
      const rows = RPH_SLOTS.filter((slot) => getCell(doc.grid, only, slot, issue.day).trim() === name);
      if (rows.length < 2) continue;
      out.push({
        kind: "double",
        store: only,
        day: issue.day,
        slot: rows[rows.length - 1]!,
        headline: `${name} is listed twice at ${storeLabel(doc, only)} on ${weekdayDay(doc, issue.day)}`,
        names: [name],
        stores: [only],
      });
    }
  }
  return out;
}

export function holeSteps(doc: ScheduleDoc, ev: Evaluation): FixStep[] {
  const out: FixStep[] = [];
  for (const issue of ev.issues) {
    if (!issue.hole) continue;
    const store = storeLabel(doc, issue.store);
    out.push({
      kind: "hole",
      store: issue.store,
      day: issue.day,
      slot: RPH_SLOTS[0]!,
      headline: `${store} has no coverage on ${weekdayDay(doc, issue.day)}`,
      names: [],
      stores: [issue.store],
    });
  }
  return out;
}

export function fixSteps(doc: ScheduleDoc, ev: Evaluation, mode: "rph" | "staff" | "all" = "rph"): FixStep[] {
  if (mode === "staff") return leftoverSteps(doc, ev, "staff");
  return [
    ...leftoverSteps(doc, ev, mode === "all" ? "all" : "rph"),
    ...licenseSteps(doc, ev),
    ...doubleSteps(doc, ev),
    ...holeSteps(doc, ev),
  ];
}

export function chipLabel(steps: FixStep[], _warns: number): string {
  if (!steps.length) return "Ready to print";
  const first = steps[0]!.headline;
  const rest = steps.length - 1;
  if (rest <= 0) return first;
  return `${first} · ${rest} more`;
}

export function stepRef(step: { store: string; slot: SlotId; day: number }): CellRef {
  return { store: step.store, slot: step.slot, day: step.day };
}

export function groupHolesByDay(
  doc: ScheduleDoc,
  holes: FixStep[],
): { day: number; heading: string; stores: { code: string; name: string; slot: SlotId }[] }[] {
  const byDay = new Map<number, FixStep[]>();
  for (const hole of holes) {
    const list = byDay.get(hole.day) ?? [];
    list.push(hole);
    byDay.set(hole.day, list);
  }
  return [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((day) => {
      const steps = byDay.get(day) ?? [];
      const stores = doc.stores.flatMap((s) => {
        const hit = steps.find((st) => st.store === s.code);
        if (!hit) return [];
        return [{ code: s.code, name: storeLabel(doc, s.code), slot: hit.slot }];
      });
      return { day, heading: weekdayDay(doc, day), stores };
    });
}

export function clearLeftoverDay(doc: ScheduleDoc, store: string, day: number): ScheduleDoc {
  let next = doc;
  for (const slot of SLOTS) {
    next = placeName(next, store, slot.id, day, "").doc;
  }
  return next;
}

export function keepDouble(doc: ScheduleDoc, name: string, day: number, keepStore: string): ScheduleDoc {
  let next = doc;
  for (const store of doc.stores) {
    if (store.code === keepStore) continue;
    for (const slot of SLOTS) {
      if (getCell(next.grid, store.code, slot.id, day).trim() === name) {
        next = placeName(next, store.code, slot.id, day, "").doc;
      }
    }
  }
  // Still in both rows of the kept store: keep the first row only.
  const rows = RPH_SLOTS.filter((slot) => getCell(next.grid, keepStore, slot, day).trim() === name);
  for (const slot of rows.slice(1)) next = placeName(next, keepStore, slot, day, "").doc;
  return next;
}

export function keepDoubleHoles(doc: ScheduleDoc, name: string, day: number, keepStore: string): string[] {
  const next = keepDouble(doc, name, day, keepStore);
  const holes: string[] = [];
  for (const store of next.stores) {
    if (!isOpenDay(next, store.code, day)) continue;
    const rph = RPH_SLOTS.some((slot) => getCell(next.grid, store.code, slot, day).trim());
    if (!rph) holes.push(store.code);
  }
  return holes;
}

export function keepDoubleLabel(doc: ScheduleDoc, name: string, day: number, keepStore: string): string {
  const storeName = storeLabel(doc, keepStore);
  const holes = keepDoubleHoles(doc, name, day, keepStore);
  if (!holes.length) return `Keep at ${storeName}`;
  const who = joinAnd(holes.map((c) => storeLabel(doc, c)));
  return `Keep at ${storeName} (${who} would have no coverage)`;
}

function isFloatPerson(role?: string, _home?: string): boolean {
  return role === "Float Pharmacist";
}

function homeTag(role?: string, home?: string): string {
  if (isFloatPerson(role, home)) {
    return home && home !== "—" ? `float · home ${home}` : "float";
  }
  return home && home !== "—" ? `home ${home}` : "";
}

function storesWithName(doc: ScheduleDoc, name: string, day: number): string[] {
  return doc.stores.filter((s) => namesOnStoreDay(doc.grid, s.code, day).includes(name)).map((s) => s.code);
}

export function holeCandidates(doc: ScheduleDoc, store: string, day: number): Candidate[] {
  const out: { name: string; tag: string; rank: number }[] = [];
  for (const p of namesForKindDetailed(doc.people, "RPh")) {
    if (storesWithName(doc, p.name, day).length) continue;
    out.push({
      name: p.name,
      tag: p.home === store ? "home" : isFloatPerson(p.role, p.home) ? "float" : p.home,
      rank: pickerRank(doc, p.name, store, day),
    });
  }
  out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return out.map(({ name, tag }) => ({ name, tag }));
}

export function sortPeopleByHome(doc: ScheduleDoc, names: string[]): string[] {
  const order = (name: string) => {
    const p = personByName(doc.people, name);
    const home = p?.home ?? "";
    const storeI = doc.stores.findIndex((s) => s.code === home);
    const base = storeI < 0 ? 99 : storeI;
    const floatBump = isFloatPerson(p?.role, home) ? 100 : 0;
    return base + floatBump;
  };
  return [...names].sort((a, b) => {
    const d = order(a) - order(b);
    return d || a.localeCompare(b);
  });
}

export function pickerLabel(
  doc: ScheduleDoc,
  name: string,
  store: string,
  day: number,
  current = "",
): string {
  const p = personByName(doc.people, name);
  const bits = [name];
  bits.push(homeTag(p?.role, p?.home));
  if (p?.lead) bits.push("Lead");
  const pto = ptoOnDay(doc, name, day);
  if (pto) bits.push("PTO");
  const on = storesWithName(doc, name, day);
  const others = on.filter((c) => c !== store);
  if (others.length) bits.push(`already ${joinAnd(others.map((c) => c))}`);
  else if (on.includes(store) && name !== current) bits.push(`already ${store}`);
  else if (!pto && !on.length) bits.push("free");
  return bits.join(" · ");
}

function pickerRank(
  doc: ScheduleDoc,
  name: string,
  store: string,
  day: number,
): number {
  if (ptoOnDay(doc, name, day)) return 4;
  if (storesWithName(doc, name, day).length) return 3;
  const p = personByName(doc.people, name);
  if (p?.home === store) return 0;
  if (isFloatPerson(p?.role, p?.home)) return 1;
  return 2;
}

/** Role-filtered names, never hidden. Home of this cell first; busy and PTO last. */
export function pickerOptions(
  doc: ScheduleDoc,
  store: string,
  kind: SlotKind,
  day: number,
  current = "",
): PickerOption[] {
  const names = namesForKindDetailed(doc.people, kind).map((p) => p.name);
  if (current && !names.includes(current)) names.unshift(current);
  return names
    .map((n) => ({
      name: n,
      label: pickerLabel(doc, n, store, day, current),
      rank: pickerRank(doc, n, store, day),
    }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map(({ name, label }) => ({ name, label }));
}

export type NameMatchHow = "exact" | "first" | "compact" | "word" | "initials" | "has";

/** Rank a typed query against a roster name. Null = no match. */
export function nameMatch(name: string, q: string): { score: number; how: NameMatchHow } | null {
  const query = q.trim().toLowerCase();
  if (!query) return null;
  const n = name.toLowerCase();
  if (n === query) return { score: 0, how: "exact" };
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts[0]?.startsWith(query)) return { score: 1, how: "first" };
  if (parts.join("").startsWith(query)) return { score: 2, how: "compact" };
  if (parts.some((p) => p.startsWith(query))) return { score: 3, how: "word" };
  const init = parts.map((p) => p[0] ?? "").join("");
  if (init.startsWith(query)) return { score: 4, how: "initials" };
  if (n.includes(query)) return { score: 5, how: "has" };
  return null;
}

/**
 * Filter and rank picker options as the user types.
 * Empty query keeps the full role list (never hides names).
 */
export function suggestNames(options: PickerOption[], q: string): PickerOption[] {
  const query = q.trim();
  if (!query) return options;
  const hits: { option: PickerOption; score: number }[] = [];
  for (const option of options) {
    const m = nameMatch(option.name, query);
    if (m) hits.push({ option, score: m.score });
  }
  hits.sort((a, b) => a.score - b.score || a.option.name.localeCompare(b.option.name));
  return hits.map((h) => h.option);
}

/** Remainder of `name` after a prefix typed in `q`, for ghost completion. */
export function ghostRest(name: string, q: string): string {
  if (!q || !name.toLowerCase().startsWith(q.toLowerCase())) return "";
  return name.slice(q.length);
}

export function warnSteps(doc: ScheduleDoc, ev: Evaluation, mode: "rph" | "staff" | "all" = "all"): WarnStep[] {
  const pto: WarnStep[] = [];
  const solo: WarnStep[] = [];
  const seenPto = new Set<string>();
  for (const issue of ev.issues) {
    for (const name of issue.ptoNames) {
      const person = personByName(doc.people, name);
      const isRph = person?.role === "Pharmacist" || person?.role === "Float Pharmacist";
      if (mode === "rph" && !isRph) continue;
      if (mode === "staff" && isRph) continue;
      const key = `${name}|${issue.store}|${issue.day}`;
      if (seenPto.has(key)) continue;
      seenPto.add(key);
      pto.push({
        kind: "pto",
        store: issue.store,
        day: issue.day,
        slot: firstSlotWithName(doc, issue.store, issue.day, [name]),
        headline: `${name} is scheduled at ${storeLabel(doc, issue.store)} on ${weekdayDay(doc, issue.day)} but has time off`,
        names: [name],
        stores: [issue.store],
      });
    }
    if (mode !== "staff" && issue.soloFloatName) {
      const floatSlot =
        RPH_SLOTS.find((slot) => getCell(doc.grid, issue.store, slot, issue.day).trim() === issue.soloFloatName) ??
        RPH_SLOTS[0]!;
      solo.push({
        kind: "solo-float",
        store: issue.store,
        day: issue.day,
        slot: floatSlot,
        headline: `${issue.soloFloatName} solo float at ${storeLabel(doc, issue.store)} ${weekdayDay(doc, issue.day)} — no lead tech`,
        names: [issue.soloFloatName],
        stores: [issue.store],
      });
    }
  }
  return [...pto, ...solo];
}

/** Clear one person from one store-day. Does not empty the whole day. */
export function clearNameOnStoreDay(
  doc: ScheduleDoc,
  store: string,
  day: number,
  name: string,
): ScheduleDoc {
  let next = doc;
  for (const slot of SLOTS) {
    if (getCell(next.grid, store, slot.id, day).trim() === name) {
      next = placeName(next, store, slot.id, day, "").doc;
    }
  }
  return next;
}
