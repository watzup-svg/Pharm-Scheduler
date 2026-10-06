import { test } from "node:test";
import assert from "node:assert/strict";
import { api, emptySession, stateHash } from "../../domain/src/index.ts";
import { dbToWorld, exportWorld, loadBytes, sameSaved, worldToDb } from "../codec.ts";
import { SQL, busyWorld, practice } from "./fakes.ts";

const meta = { dbUuid: "u1", rev: 3, savedAt: "2026-10-06T10:00:00.000Z" };
const roundTrip = (w: ReturnType<typeof practice>) => {
  const db = worldToDb(SQL, w, meta);
  const bytes = db.export();
  db.close();
  return loadBytes(SQL, bytes);
};

test("round trip is exact on the practice world", () => {
  const w = practice();
  const r = roundTrip(w);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.world, { ...w, session: emptySession() });
  assert.ok(sameSaved(r.world, w));
  assert.equal(r.meta.dbUuid, "u1");
  assert.equal(r.meta.rev, 3);
  assert.deepEqual(r.problems, []);
});

test("round trip is exact after commits, undo, checkpoint, post, told", () => {
  const { world } = busyWorld();
  assert.ok(world.journal.changeSets.length >= 5 && world.journal.checkpoints.length === 1 && world.journal.snapshots.length === 1);
  const r = roundTrip(world);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.world, { ...world, session: emptySession() });
  assert.equal(stateHash(r.world.state), r.meta.stateHash);
});

test("session (proposal / scenario) is not saved", () => {
  const w = practice();
  const s = api.openScenario(w, "what if");
  assert.ok(!("refused" in s));
  if ("refused" in s) return;
  const r = roundTrip(s);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.world.session, { proposal: null, scenario: null });
});

test("change_sets is append-only", () => {
  const db = worldToDb(SQL, busyWorld().world, meta);
  assert.throws(() => db.run("UPDATE change_sets SET id = 'x'"), /append-only/);
  assert.throws(() => db.run("DELETE FROM change_sets"), /append-only/);
  assert.ok(Number(db.exec("SELECT count(*) FROM change_sets")[0]!.values[0]![0]) >= 5);
  db.close();
});

test("garbage, empty, truncated and foreign files are refused", () => {
  const good = exportWorld(SQL, practice(), meta);
  const bad: [string, Uint8Array, string][] = [
    ["empty", new Uint8Array(0), "not-sqlite"],
    ["garbage", new TextEncoder().encode("hello world".repeat(50)), "not-sqlite"],
    ["truncated", good.slice(0, 9000), "integrity"],
  ];
  for (const [name, bytes, reason] of bad) {
    const r = loadBytes(SQL, bytes);
    assert.ok(!r.ok, name);
    if (!r.ok) assert.ok(r.reason === reason || r.reason === "integrity" || r.reason === "not-sqlite", `${name}: ${r.reason}`);
  }
  const other = new SQL.Database();
  other.run("CREATE TABLE t(a)");
  const r = loadBytes(SQL, other.export());
  assert.ok(!r.ok && r.reason === "wrong-app");
  // damaged page in the middle
  const damaged = good.slice();
  for (let i = 0; i < 4096; i++) damaged[8192 + i] = (i * 31) & 255;
  const d = loadBytes(SQL, damaged);
  assert.ok(!d.ok);
});

test("hash mismatch is refused with a clear reason", () => {
  const db = worldToDb(SQL, practice(), meta);
  db.run("UPDATE assignments SET json = replace(json, 'manual', 'build') WHERE key = 'A1'");
  const r = loadBytes(SQL, db.export());
  db.close();
  assert.ok(!r.ok);
  if (!r.ok) {
    assert.equal(r.reason, "hash-mismatch");
    assert.match(r.error, /fingerprint/);
  }
});

test("repairable inconsistency opens with problems listed (no repair)", () => {
  const w = practice();
  const bad = structuredClone(w);
  bad.state.nextId.assignment = 1;
  const r = roundTrip(bad);
  assert.ok(r.ok);
  if (r.ok) {
    assert.ok(r.problems.length > 0);
    assert.equal(r.world.state.nextId.assignment, 1);
  }
});

test("unusable data (dangling reference, bad date) is refused with the first problems named", () => {
  const w = practice();
  const bad = structuredClone(w);
  const a = Object.values(bad.state.assignments)[0]!;
  a.storeId = "S999";
  const r = roundTrip(bad);
  assert.ok(!r.ok);
  if (!r.ok) {
    assert.equal(r.reason, "unreadable");
    assert.match(r.error, /damaged/);
    assert.match(r.error, /unknown store S999/);
  }
  const bad2 = structuredClone(w);
  Object.values(bad2.state.assignments)[1]!.date = "2026-02-30";
  const r2 = roundTrip(bad2);
  assert.ok(!r2.ok && /bad date/.test(r2.error));
});

test("dbToWorld alone rebuilds the world", () => {
  const w = practice();
  const db = worldToDb(SQL, w, meta);
  const { world } = dbToWorld(db);
  db.close();
  assert.deepEqual(world.state, w.state);
});
