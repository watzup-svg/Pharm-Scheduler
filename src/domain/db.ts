// The in-memory database: plain tables, an append-only log of change sets, and named checkpoints.
// Spike scope: generic tables and put/del events. The real schema arrives in Phase 3; the persistence design does not depend on it.
// Pure: no clock, no randomness, no browser. Anything time-like (a stamp) or identifying (a db id) is passed in.
import { canon, compareCodePoints, type Json } from "./canon.ts";
import { sha256 } from "./hash.ts";

export type Row = { [key: string]: Json };
export type Tables = { [table: string]: { [id: string]: Row } };
export type DbEvent = { op: "put"; table: string; id: string; row: Row } | { op: "del"; table: string; id: string };
export type ChangeSet = { seq: number; label: string; source: string; stamp: string; events: DbEvent[] };
export type Checkpoint = { name: string; seq: number; hash: string; stamp: string };
export type Db = { id: string; tables: Tables; seq: number; log: ChangeSet[]; checkpoints: Checkpoint[] };

export function newDb(id: string): Db {
  return { id, tables: {}, seq: 0, log: [], checkpoints: [] };
}

const clone = <T extends Json>(v: T): T => JSON.parse(canon(v)) as T;

export function stateHash(tables: Tables): string {
  return sha256(canon(tables as Json));
}

/** Apply events in order to `tables` (mutates). Returns the events that actually changed something. */
export function applyEvents(tables: Tables, events: readonly DbEvent[]): DbEvent[] {
  const changed: DbEvent[] = [];
  for (const e of events) {
    const t = tables[e.table];
    if (e.op === "put") {
      const row = clone(e.row);
      if (t?.[e.id] && canon(t[e.id]!) === canon(row)) continue;
      (tables[e.table] ??= {})[e.id] = row;
      changed.push({ op: "put", table: e.table, id: e.id, row });
    } else {
      if (!t?.[e.id]) continue;
      delete t[e.id];
      if (Object.keys(t).length === 0) delete tables[e.table];
      changed.push({ op: "del", table: e.table, id: e.id });
    }
  }
  return changed;
}

/** One atomic change set. Events that change nothing are dropped; if none are left, nothing is committed and null comes back. */
export function commit(db: Db, input: { label: string; source: string; stamp: string; events: readonly DbEvent[] }): ChangeSet | null {
  // Validate every row first (canon throws on anything not plain data), so applying cannot fail half way.
  for (const e of input.events) if (e.op === "put") canon(e.row);
  const events = applyEvents(db.tables, input.events);
  if (events.length === 0) return null;
  const cs: ChangeSet = { seq: db.seq + 1, label: input.label, source: input.source, stamp: input.stamp, events };
  db.seq = cs.seq;
  db.log.push(cs);
  return cs;
}

/** Re-apply a change set read from a file. The seq must follow on exactly. */
export function replayInto(db: Db, cs: ChangeSet): void {
  if (cs.seq !== db.seq + 1) throw new Error(`log gap: expected change set ${db.seq + 1}, found ${cs.seq}`);
  applyEvents(db.tables, cs.events);
  db.seq = cs.seq;
  db.log.push(cs);
}

export function tablesAt(db: Db, seq: number): Tables {
  if (seq < 0 || seq > db.seq) throw new Error(`no such state: ${seq}`);
  const t: Tables = {};
  for (const cs of db.log) {
    if (cs.seq > seq) break;
    applyEvents(t, cs.events);
  }
  return t;
}

/** The events that turn `from` into `to`, in a fixed order (table, then id, by code point). */
export function diffTables(from: Tables, to: Tables): DbEvent[] {
  const out: DbEvent[] = [];
  const names = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort(compareCodePoints);
  for (const table of names) {
    const a = from[table] ?? {};
    const b = to[table] ?? {};
    for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareCodePoints)) {
      if (!b[id]) out.push({ op: "del", table, id });
      else if (!a[id] || canon(a[id]!) !== canon(b[id]!)) out.push({ op: "put", table, id, row: b[id]! });
    }
  }
  return out;
}

export function makeCheckpoint(db: Db, name: string, stamp: string): Checkpoint {
  if (!name.trim()) throw new Error("A checkpoint needs a name.");
  if (db.checkpoints.some((c) => c.name === name)) throw new Error(`A checkpoint named "${name}" already exists.`);
  const cp: Checkpoint = { name, seq: db.seq, hash: stateHash(db.tables), stamp };
  db.checkpoints.push(cp);
  return cp;
}

/** Revert to a checkpoint is itself a change set, so it can be seen in History and is never a silent rewind. */
export function revertToCheckpoint(db: Db, name: string, stamp: string): ChangeSet | null {
  const cp = db.checkpoints.find((c) => c.name === name);
  if (!cp) throw new Error(`No checkpoint named "${name}".`);
  const target = tablesAt(db, cp.seq);
  if (stateHash(target) !== cp.hash) throw new Error(`Checkpoint "${name}" does not match the log; refusing to revert.`);
  return commit(db, { label: `Revert to checkpoint "${name}"`, source: "revert", stamp, events: diffTables(db.tables, target) });
}
