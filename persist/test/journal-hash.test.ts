// The change history is fingerprinted beside the state: a damaged or edited history is refused, an older file without the fingerprint still opens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBytes, worldToDb } from "../codec.ts";
import { SQL, busyWorld } from "./fakes.ts";

const meta = { dbUuid: "u1", rev: 3, savedAt: "2026-10-06T10:00:00.000Z" };
const withDb = (f: (db: ReturnType<typeof worldToDb>) => void): Uint8Array => {
  const db = worldToDb(SQL, busyWorld().world, meta);
  try { f(db); return db.export(); } finally { db.close(); }
};

test("an untouched file opens", () => {
  assert.ok(loadBytes(SQL, withDb(() => {})).ok);
});

test("an altered change set is refused with a clear reason", () => {
  const bytes = withDb((db) => {
    // The file refuses edits to its history; damage from outside would not (drop the guard to simulate it).
    for (const [name] of db.exec("SELECT name FROM sqlite_master WHERE type='trigger'")[0]?.values ?? []) db.run(`DROP TRIGGER ${String(name)}`);
    db.run("UPDATE change_sets SET json = replace(json, '\"label\":\"', '\"label\":\"zz') WHERE seq = (SELECT max(seq) FROM change_sets)");
  });
  const r = loadBytes(SQL, bytes);
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.reason, "hash-mismatch"); assert.match(r.error, /change history/); }
});

test("a file saved before the history fingerprint existed still opens", () => {
  const bytes = withDb((db) => db.run("DELETE FROM meta WHERE k = 'journal_hash'"));
  assert.ok(loadBytes(SQL, bytes).ok);
});
