// Hostile files: every one must come back as a refusal or a world, never an uncaught exception.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBytes, salvageBytes, exportWorld, worldToDb } from "../codec.ts";
import { SQL, practice } from "./fakes.ts";

const meta = { dbUuid: "u1", rev: 3, savedAt: "2026-10-06T10:00:00.000Z" };
const good = exportWorld(SQL, practice(), meta);

function rng(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const settle = (bytes: Uint8Array, label: string) => {
  try {
    const r = loadBytes(SQL, bytes);
    assert.ok(r.ok === true || r.ok === false);
    salvageBytes(SQL, bytes);
    return r;
  } catch (e) { assert.fail(`${label}: threw ${(e as Error).stack}`); }
};
const edited = (sql: string) => {
  const db = worldToDb(SQL, practice(), meta);
  try { db.exec(sql); return db.export(); } finally { db.close(); }
};

test("truncated files at many lengths are refused", () => {
  for (const n of [0, 1, 15, 99, 100, 512, 4096, 4097, 8192, 20000, Math.floor(good.length / 2), good.length - 1]) {
    const r = settle(good.slice(0, n), `truncated ${n}`);
    assert.ok(r && !r.ok, `truncated ${n} was accepted`);
  }
});

test("bit flips never escape as exceptions (and are never silently accepted as different data)", () => {
  const next = rng(5);
  let refused = 0;
  const orig = loadBytes(SQL, good);
  assert.ok(orig.ok);
  for (let i = 0; i < 300; i++) {
    const b = good.slice();
    const flips = 1 + Math.floor(next() * 4);
    for (let f = 0; f < flips; f++) b[Math.floor(next() * b.length)]! ^= 1 << Math.floor(next() * 8);
    const r = settle(b, `flip ${i}`);
    if (r && !r.ok) refused++;
    else if (r && r.ok && orig.ok) assert.equal(r.meta.stateHash, orig.meta.stateHash, `flip ${i}: accepted a changed world`);
  }
  assert.ok(refused > 100);
});

test("wrong versions, wrong app, empty and missing tables, junk rows", () => {
  for (const sql of [
    "PRAGMA user_version=99", "PRAGMA user_version=0", "PRAGMA application_id=1",
    "DELETE FROM config", "DELETE FROM nextId", "DELETE FROM meta", "DROP TABLE stores", "DROP TABLE change_sets",
    "UPDATE meta SET v = 'other' WHERE k = 'app'",
    "UPDATE config SET json = 'not json'", "UPDATE config SET json = 'null'", "UPDATE nextId SET json = '[]'",
    "UPDATE stores SET json = 'null'", "UPDATE assignments SET json = '7'", "UPDATE assignments SET json = '{}'",
    "UPDATE change_sets_x SET json = '{}'",
    "DELETE FROM stores", "DELETE FROM pharmacists", "DELETE FROM requirements",
  ]) {
    let bytes: Uint8Array;
    try { bytes = edited(sql); } catch { continue; }
    const r = settle(bytes, sql);
    assert.ok(r && !r.ok, `${sql} was accepted`);
  }
});

test("a hash that was recomputed over damaged data is still refused", () => {
  const w = structuredClone(practice());
  const [a, b] = Object.values(w.state.assignments);
  a!.date = "99-99";
  b!.pharmacistId = "P404";
  w.state.config.maxConsecutiveDays = -3;
  const db = worldToDb(SQL, w, meta);
  const r = settle(db.export(), "recomputed");
  db.close();
  assert.ok(r && !r.ok && r.reason === "unreadable");
  if (r && !r.ok) assert.match(r.error, /damaged/);
});

test("huge strings, many rows and hostile keys do not crash the loader", () => {
  const big = "x".repeat(5_000_000);
  const w = structuredClone(practice());
  Object.values(w.state.stores)[0]!.name = big;
  const db = worldToDb(SQL, w, meta);
  const r = settle(db.export(), "huge name");
  db.close();
  assert.ok(r && r.ok);
  // a key named __proto__ must not become a prototype
  const bytes = edited("INSERT INTO stores(key, json) VALUES ('__proto__', '{\"id\":\"__proto__\"}'), ('constructor', '5')");
  const p = settle(bytes, "proto");
  assert.ok(p && !p.ok);
  assert.equal(({} as Record<string, unknown>).id, undefined);
  // 20000 junk assignment rows
  const rows = Array.from({ length: 20000 }, (_, i) => `('J${i}', '{"id":"J${i}","date":"${"9".repeat(200)}"}')`).join(",");
  const many = settle(edited(`INSERT INTO assignments(key, json) VALUES ${rows}`), "many rows");
  assert.ok(many && !many.ok);
  if (many && !many.ok) assert.ok(many.error.length < 600, "refusal message must stay short");
});
