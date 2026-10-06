// The "practice month with problems" must really contain problems of every kind, stay valid, and be the same every time for a given day.
import { test } from "node:test";
import assert from "node:assert/strict";
import { api, checkIntegrity, problemsWorld, stateHash } from "../src/index.ts";

for (const today of ["2026-10-06", "2026-10-31", "2027-02-27", "2026-12-28"]) {
  test(`problems world on ${today}: valid, deterministic, full of problems`, () => {
    const a = problemsWorld(today), b = problemsWorld(today);
    assert.equal(stateHash(a.world.state), stateHash(b.world.state));
    assert.deepEqual(checkIntegrity(a.world.state, a.world.journal), []);
    const range = { from: today, to: ((d) => new Date(Date.parse(d) + 30 * 864e5).toISOString().slice(0, 10))(today) };
    const ev = api.evaluate(a.world.state, today, { range, includeRequested: false });
    const rules = new Set<string>();
    for (const e of Object.values(ev.assignments)) for (const r of e.results) if (r.verdict === "Fail" && !r.overridden) rules.add(r.ruleId);
    const cells = Object.values(ev.cells);
    const open = cells.filter((c) => c.open > 0).length;
    assert.ok(open >= 6, `open shifts ${open}`);
    for (const id of ["availability", "closure", "consecutive-days", "double-booking", "licensing", "travel-hard"]) assert.ok(rules.has(id), `missing a ${id} problem; have ${[...rules]}`);
    assert.ok(cells.some((c) => c.surplus > 0), "a surplus");
    assert.ok(Object.values(a.world.state.unavailability).filter((u) => u.status === "Requested").length >= 3, "waiting requests");
    assert.ok(api.toTell(a.world, today).length > 0, "someone to tell about a change after posting");
    // the engine can work on it without throwing
    assert.doesNotThrow(() => api.build(a.world, range, today));
    assert.doesNotThrow(() => api.improve(a.world, range, today));
  });
}
