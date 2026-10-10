import test from "node:test";
import assert from "node:assert/strict";
import { commit, diffTables, makeCheckpoint, newDb, revertToCheckpoint, stateHash, tablesAt, type DbEvent } from "./db.ts";

const put = (table: string, id: string, row: Record<string, string | number>): DbEvent => ({ op: "put", table, id, row });

function sample() {
  const db = newDb("db-1");
  commit(db, { label: "stores", source: "manual", stamp: "s1", events: [put("store", "S1", { n: 1 }), put("store", "S2", { n: 2 })] });
  commit(db, { label: "place", source: "manual", stamp: "s2", events: [put("assignment", "A1", { who: "P1", store: "S1", date: "2026-10-01" })] });
  return db;
}

test("a change set that changes nothing is not committed", () => {
  const db = sample();
  assert.equal(commit(db, { label: "again", source: "manual", stamp: "s3", events: [put("store", "S1", { n: 1 }), { op: "del", table: "store", id: "nope" }] }), null);
  assert.equal(db.seq, 2);
});

test("state hash does not depend on the order independent events arrive in", () => {
  const a = newDb("x");
  const b = newDb("x");
  const evs = [put("t", "1", { v: 1 }), put("t", "2", { v: 2 }), put("u", "9", { v: 9 })];
  commit(a, { label: "l", source: "s", stamp: "", events: evs });
  commit(b, { label: "l", source: "s", stamp: "", events: [...evs].reverse() });
  assert.equal(stateHash(a.tables), stateHash(b.tables));
});

test("revert to a checkpoint is a new change set that restores the state, and keeps the history", () => {
  const db = sample();
  makeCheckpoint(db, "before-build", "s2");
  const at = stateHash(db.tables);
  commit(db, { label: "build", source: "build", stamp: "s3", events: [put("assignment", "A2", { who: "P2", store: "S2", date: "2026-10-01" }), { op: "del", table: "assignment", id: "A1" }] });
  assert.notEqual(stateHash(db.tables), at);
  const cs = revertToCheckpoint(db, "before-build", "s4")!;
  assert.equal(stateHash(db.tables), at);
  assert.equal(cs.seq, 4);
  assert.equal(cs.source, "revert");
  assert.equal(db.log.length, 4);
  assert.equal(revertToCheckpoint(db, "before-build", "s5"), null, "already there: nothing to commit");
});

test("tablesAt replays the log to any earlier point; diff is stable", () => {
  const db = sample();
  assert.deepEqual(Object.keys(tablesAt(db, 1)), ["store"]);
  const ev = diffTables(tablesAt(db, 1), db.tables);
  assert.deepEqual(ev.map((e) => `${e.op}:${e.table}:${e.id}`), ["put:assignment:A1"]);
});

test("duplicate or empty checkpoint names are refused", () => {
  const db = sample();
  makeCheckpoint(db, "a", "");
  assert.throws(() => makeCheckpoint(db, "a", ""));
  assert.throws(() => makeCheckpoint(db, "  ", ""));
});
