// Undo and redo must never put the same person at the same store and day twice. Found by the random-click stress (seed 5 of the high run).
import { test } from "node:test";
import assert from "node:assert/strict";
import { api, checkIntegrity, seedWorld, type Refusal } from "../src/index.ts";

const w0 = () => seedWorld({ stores: [{ id: "S1" }, { id: "S2" }], pharmacists: [{ id: "P1", base: "S1" }, { id: "P2", base: "S1" }], assignments: [{ store: "S2", ph: "P2", date: "2026-10-12" }] });
const place = (w: ReturnType<typeof w0>) => api.commit(w, [{ t: "place", storeId: "S1", pharmacistId: "P1", date: "2026-10-12" }], { kind: "manual", label: "place" });
function ok<T>(r: T | Refusal): T { if (typeof r === "object" && r !== null && "refused" in r) throw new Error((r as Refusal).reason); return r as T; }

test("redoing a placement is refused when a later change already placed the same person there", () => {
  const c1 = ok(place(w0()));
  const u1 = ok(api.undo(c1.world, c1.changeSet.id));
  const c2 = ok(place(u1.world));
  const redo = api.undo(c2.world, u1.changeSet.id);
  assert.ok("refused" in redo, "the redo should be refused");
  assert.match((redo as { reason: string }).reason, /already placed at S1 on 2026-10-12/);
  assert.deepEqual(checkIntegrity(c2.world.state), []);
});

test("undoing a removal is refused when the person was placed there again meanwhile", () => {
  const c1 = ok(place(w0()));
  const id = Object.values(c1.world.state.assignments).find((a) => a.pharmacistId === "P1")!.id;
  const r = ok(api.commit(c1.world, [{ t: "remove", assignmentId: id }], { kind: "manual", label: "remove" }));
  const c3 = ok(place(r.world));
  const back = api.undo(c3.world, r.changeSet.id);
  assert.ok("refused" in back);
});

test("a plain undo and redo still work", () => {
  const c1 = ok(place(w0()));
  const u1 = ok(api.undo(c1.world, c1.changeSet.id));
  const redo = ok(api.undo(u1.world, u1.changeSet.id));
  assert.deepEqual(checkIntegrity(redo.world.state), []);
  assert.equal(Object.values(redo.world.state.assignments).filter((a) => a.pharmacistId === "P1").length, 1);
});
