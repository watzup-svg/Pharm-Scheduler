import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.ts";
import { seedWorld } from "../src/seed.ts";
import { checkIntegrity } from "../src/integrity.ts";

const base = () => seedWorld({
  stores: [{ id: "S1" }, { id: "S2" }],
  pharmacists: [{ id: "P1", base: "S1" }, { id: "P2", base: "S2" }],
  assignments: [{ id: "A1", store: "S1", ph: "P1", date: "2026-05-04" }],
});

test("commit then undo restores the exact state hash", () => {
  const w = base();
  const h0 = api.stateHash(w.state);
  const c = api.commit(w, [{ t: "place", storeId: "S2", pharmacistId: "P2", date: "2026-05-04" }], { kind: "manual" });
  assert.ok(!("refused" in c));
  if ("refused" in c) return;
  assert.notEqual(api.stateHash(c.world.state), h0);
  assert.equal(c.changeSet.label, "Placed by you.");
  const u = api.undo(c.world, c.changeSet.id);
  assert.ok(!("refused" in u));
  if ("refused" in u) return;
  assert.equal(api.stateHash(u.world.state), h0);
});

test("a failed edit changes nothing (atomic)", () => {
  const w = base();
  const r = api.commit(w, [
    { t: "place", storeId: "S2", pharmacistId: "P2", date: "2026-05-04" },
    { t: "place", storeId: "S9", pharmacistId: "P2", date: "2026-05-05" },
  ], { kind: "manual" });
  assert.ok("refused" in r);
  assert.equal(Object.keys(w.state.assignments).length, 1);
});

test("revert to checkpoint reproduces the checkpoint hash and is itself a change set", () => {
  let w = base();
  w = api.checkpoint(w, "cp1");
  const h = api.stateHash(w.state);
  for (const d of ["2026-05-05", "2026-05-06"]) {
    const c = api.commit(w, [{ t: "place", storeId: "S1", pharmacistId: "P1", date: d }], { kind: "manual" });
    assert.ok(!("refused" in c));
    if (!("refused" in c)) w = c.world;
  }
  const r = api.revertToCheckpoint(w, "cp1");
  assert.ok(!("refused" in r));
  if ("refused" in r) return;
  assert.equal(api.stateHash(r.world.state), h);
  assert.equal(r.changeSet.kind, "revert");
});

test("evaluate never reads the clock: same input, same output", () => {
  const w = base();
  assert.deepEqual(api.evaluate(w.state, "2026-05-01"), api.evaluate(w.state, "2026-05-01"));
});

test("integrity check finds dangling ids", () => {
  const w = base();
  assert.deepEqual(checkIntegrity(w.state), []);
  w.state.assignments["A1"]!.storeId = "S9";
  assert.equal(checkIntegrity(w.state).length, 1);
});

test("no wall clock or locale in domain source", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../src/", import.meta.url);
  for (const f of readdirSync(dir)) {
    const text = readFileSync(new URL(f, dir), "utf8");
    assert.ok(!/new Date\(|Date\.now|localeCompare|Math\.random|performance\.now/.test(text), `${f} uses clock, locale or randomness`);
  }
});
