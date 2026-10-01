import { driveKey } from "./geo.ts";
import type { DayNotes, Grid, Pattern, Person, ScheduleDoc, SlotId, Store } from "./types.ts";

function clone<T>(v: T): T {
  return structuredClone(v);
}

/** Walk grid or pattern and rewrite a display name. Empty `to` deletes the cell. */
function rewriteNames<T extends Grid | Pattern>(map: T, from: string, to: string): T {
  if (from === to) return map;
  const trimmed = to.trim();
  const next = clone(map);
  for (const store of Object.keys(next)) {
    const slots = next[store] ?? {};
    for (const slot of Object.keys(slots)) {
      const row = slots[slot as SlotId];
      if (!row) continue;
      for (const key of Object.keys(row)) {
        if (row[key] !== from) continue;
        if (trimmed) row[key] = trimmed;
        else delete row[key];
      }
    }
  }
  return next;
}

/** Move a top-level store key on grid, pattern, or dayNotes. */
function recodeKey<T extends Grid | Pattern | DayNotes>(map: T, from: string, to: string): T {
  if (from === to) return map;
  if (!Object.hasOwn(map, from)) return map;
  const next = { ...map } as T;
  const bag = next as Record<string, unknown>;
  bag[to] = bag[from];
  delete bag[from];
  return next;
}

/** Accepted problems are keyed by store code or person name. When either is renamed the accept must move with it. */
function rekeyAccepted(doc: ScheduleDoc, from: string, to: string, kinds: ("hole" | "leftover" | "double")[]): ScheduleDoc["accepted"] {
  if (!doc.accepted?.length || from === to) return doc.accepted;
  return doc.accepted.map((a) => {
    const m = /^(hole|leftover|double)\|(.+)\|(\d+)$/.exec(a.key);
    if (!m || !kinds.includes(m[1] as "hole") || m[2] !== from) return a;
    return { ...a, key: `${m[1]}|${to}|${m[3]}` };
  });
}

export function applyPerson(doc: ScheduleDoc, fromName: string, person: Person): ScheduleDoc {
  const accepted = rekeyAccepted(doc, fromName, person.name, ["double"]);
  return {
    ...doc,
    ...(accepted ? { accepted } : {}),
    people: doc.people.map((p) => (p.name === fromName ? person : p)),
    timeOff: doc.timeOff.map((t) => (t.name === fromName ? { ...t, name: person.name } : t)),
    grid: rewriteNames(doc.grid, fromName, person.name),
    pattern: rewriteNames(doc.pattern, fromName, person.name),
  };
}

export function removePersonDoc(doc: ScheduleDoc, name: string): ScheduleDoc {
  return {
    ...doc,
    people: doc.people.filter((p) => p.name !== name),
    timeOff: doc.timeOff.filter((t) => t.name !== name),
    grid: rewriteNames(doc.grid, name, ""),
    pattern: rewriteNames(doc.pattern, name, ""),
  };
}

function rekeyDrive(doc: ScheduleDoc, from: string, to: string | null): Pick<ScheduleDoc, "driveMinutes"> {
  if (!doc.driveMinutes) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(doc.driveMinutes)) {
    const [a, b] = k.split("|") as [string, string];
    if (a !== from && b !== from) {
      out[k] = v;
      continue;
    }
    if (to == null) continue;
    out[driveKey(a === from ? to : a, b === from ? to : b)] = v;
  }
  return Object.keys(out).length ? { driveMinutes: out } : {};
}

export function applyStore(doc: ScheduleDoc, fromCode: string, store: Store): ScheduleDoc {
  const code = store.code;
  const accepted = rekeyAccepted(doc, fromCode, code, ["hole", "leftover"]);
  const { driveMinutes: _old, ...rest } = doc;
  return {
    ...rest,
    ...rekeyDrive(doc, fromCode, code),
    ...(accepted ? { accepted } : {}),
    stores: doc.stores.map((s) => (s.code === fromCode ? store : s)),
    people: doc.people.map((p) => (p.home === fromCode ? { ...p, home: code } : p)),
    holidays: doc.holidays.map((h) => (h.store === fromCode ? { ...h, store: code } : h)),
    grid: recodeKey(doc.grid, fromCode, code),
    pattern: recodeKey(doc.pattern, fromCode, code),
    dayNotes: recodeKey(doc.dayNotes, fromCode, code),
  };
}

export function removeStoreDoc(doc: ScheduleDoc, code: string): ScheduleDoc {
  const grid = { ...doc.grid };
  delete grid[code];
  const pattern = { ...doc.pattern };
  delete pattern[code];
  const dayNotes = { ...doc.dayNotes };
  delete dayNotes[code];
  const { driveMinutes: _old, ...rest } = doc;
  return {
    ...rest,
    ...rekeyDrive(doc, code, null),
    stores: doc.stores.filter((s) => s.code !== code),
    people: doc.people.map((p) => (p.home === code ? { ...p, home: "—" } : p)),
    holidays: doc.holidays.filter((h) => h.store !== code),
    grid,
    pattern,
    dayNotes,
  };
}
