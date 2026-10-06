import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { api } from "../../domain/src/api.ts";
import { seedWorld } from "../../domain/src/seed.ts";
import type { World } from "../../domain/src/api-types.ts";
import type { PostingSnapshot } from "../../domain/src/types.ts";
import { paginate, pdfFileName, periodKey, periodLabel, snapshotToPrintModel, warningSentence } from "./model.ts";
import { buildPacketBytes } from "./pdf.ts";

// Oct 2026: Oct 1 is a Thursday. Sundays (4, 11, 18, 25) are closed by default.
function world(): World {
  return seedWorld({
    stores: [
      { id: "S1", code: "EST", name: "Estacada", state: "OR" },
      { id: "S2", code: "VAN", name: "Vancouver", state: "WA", twoDays: [2] },
    ],
    pharmacists: [
      { id: "P1", name: "Jane Doe", initials: "JD" },
      { id: "P2", name: "Mo Quenby", initials: "MQ" },
      { id: "P3", name: "Al Ray", initials: "AR" },
    ],
    assignments: [
      { store: "S1", ph: "P1", date: "2026-10-05" },
      { store: "S1", ph: "P2", date: "2026-10-06" },
      { store: "S2", ph: "P3", date: "2026-10-06" }, // Tuesday: needs 2, has 1 -> one open box
      { store: "S2", ph: "P1", date: "2026-10-07" },
    ],
  });
}
const post = (w: World, from: string, to: string, asOf = "2026-10-01"): { world: World; snapshot: PostingSnapshot } => api.post(w, { from, to }, asOf);
const cell = (m: ReturnType<typeof snapshotToPrintModel>, code: string, date: string) =>
  m.stores.find((s) => s.code === code)!.weeks.flat().find((d) => d.date === date)!;

describe("print model", () => {
  it("closed days are closed and say so; open days are not", () => {
    const { snapshot, world: w } = post(world(), "2026-10-01", "2026-10-31");
    const m = snapshotToPrintModel(snapshot, w.state);
    assert.equal(cell(m, "EST", "2026-10-04").closed, true);
    assert.equal(cell(m, "EST", "2026-10-04").open, 0);
    assert.equal(cell(m, "EST", "2026-10-05").closed, false);
    assert.deepEqual(cell(m, "EST", "2026-10-05").initials, ["JD"]);
  });

  it("two pharmacists in one cell, and a blank box for each missing one", () => {
    const w = seedWorld({
      stores: [{ id: "S2", code: "VAN", name: "Vancouver", state: "WA", twoDays: [2] }],
      pharmacists: [{ id: "P1", name: "Jane Doe", initials: "JD" }, { id: "P3", name: "Al Ray", initials: "AR" }],
      assignments: [{ store: "S2", ph: "P3", date: "2026-10-06" }, { store: "S2", ph: "P1", date: "2026-10-06" }, { store: "S2", ph: "P1", date: "2026-10-13" }],
    });
    const { snapshot } = post(w, "2026-10-01", "2026-10-31");
    const m = snapshotToPrintModel(snapshot, w.state);
    assert.deepEqual(cell(m, "VAN", "2026-10-06").initials, ["AR", "JD"]);
    assert.equal(cell(m, "VAN", "2026-10-06").open, 0);
    assert.equal(cell(m, "VAN", "2026-10-13").open, 1); // needs 2, one posted
    assert.equal(cell(m, "VAN", "2026-10-20").open, 2); // needs 2, nobody
    assert.equal(cell(m, "VAN", "2026-10-14").open, 1); // needs 1, nobody
    const vanOpen = m.stores[0]!.openTotal;
    assert.equal(vanOpen, snapshot.warnings.open, "boxes on the page add up to the open count on the snapshot");
  });

  it("a month boundary in a two week range: both months labelled, outside days blank", () => {
    const w = world();
    const { snapshot } = post(w, "2026-10-26", "2026-11-08");
    const m = snapshotToPrintModel(snapshot, w.state);
    const est = m.stores.find((s) => s.code === "EST")!;
    assert.equal(est.weeks.length, 3); // Oct 25-31, Nov 1-7, Nov 8-14
    const flat = est.weeks.flat();
    assert.equal(flat[0]!.date, "2026-10-25"); // Sunday before the range
    assert.equal(flat[0]!.inRange, false);
    assert.equal(flat[1]!.label, "Oct 26"); // first day of the range carries its month
    assert.equal(flat.find((d) => d.date === "2026-11-01")!.label, "Nov 1");
    assert.equal(flat.find((d) => d.date === "2026-11-08")!.inRange, true);
    assert.equal(flat[flat.length - 1]!.inRange, false);
    assert.equal(m.period, "Oct 26 to Nov 8, 2026");
    assert.equal(m.filename, "HiSchool_2026-10-26_to_2026-11-08_rev1.pdf");
    assert.equal(m.glance[0]!.dates.length, 14);
  });

  it("names legend: initials to full names, only those on the page", () => {
    const w = world();
    const { snapshot } = post(w, "2026-10-01", "2026-10-31");
    const m = snapshotToPrintModel(snapshot, w.state);
    const est = m.stores.find((s) => s.code === "EST")!;
    assert.deepEqual(est.legend, [{ initials: "JD", names: ["Jane Doe"] }, { initials: "MQ", names: ["Mo Quenby"] }]);
    assert.deepEqual(m.stores.find((s) => s.code === "VAN")!.legend.map((l) => l.initials), ["AR", "JD"]);
  });

  it("revision line, period and store heading", () => {
    const { snapshot, world: w } = post(world(), "2026-10-01", "2026-10-31", "2026-10-06");
    const m = snapshotToPrintModel(snapshot, w.state);
    assert.equal(m.revisionLine, "Revision 1, posted Oct 6, 2026");
    assert.equal(m.period, "October 2026");
    assert.equal(m.filename, "HiSchool_2026-10_rev1.pdf");
    assert.equal(m.stores[0]!.title, "EST  Estacada");
    assert.equal(m.stores[0]!.state, "OR");
  });

  it("reprint of an old snapshot after the live schedule changed is identical", () => {
    const w1 = world();
    const r1 = post(w1, "2026-10-01", "2026-10-31", "2026-10-06");
    const before = snapshotToPrintModel(r1.snapshot, r1.world.state);
    const bytesBefore = Buffer.from(buildPacketBytes(before)).toString("latin1");

    // The schedule changes: JD is removed from Oct 5, MQ added, a requirement changes, rev 2 is posted.
    const live = r1.world;
    const a = Object.values(live.state.assignments).find((x) => x.date === "2026-10-05")!;
    const c1 = api.commit(live, [{ t: "remove", assignmentId: a.id }], { kind: "manual" });
    assert.ok(!("refused" in c1), "commit went through");
    const live2 = (c1 as { world: World }).world;
    const r2 = post(live2, "2026-10-01", "2026-10-31", "2026-10-08");
    assert.equal(r2.snapshot.revision, 2);
    assert.notDeepEqual(r2.snapshot.cells, r1.snapshot.cells);

    const old = r2.world.journal.snapshots.find((s) => s.revision === 1)!;
    const after = snapshotToPrintModel(old, r2.world.state);
    assert.deepEqual(after, before);
    assert.equal(Buffer.from(buildPacketBytes(after)).toString("latin1"), bytesBefore);
    // And the new revision differs on that day.
    const cur = snapshotToPrintModel(r2.snapshot, r2.world.state);
    assert.deepEqual(cell(cur, "EST", "2026-10-05").initials, []);
    assert.deepEqual(cell(after, "EST", "2026-10-05").initials, ["JD"]);
  });

  it("pagination: glance first, two-up halves the store sheets", () => {
    const { snapshot, world: w } = post(world(), "2026-10-01", "2026-10-31");
    const m = snapshotToPrintModel(snapshot, w.state);
    assert.equal(paginate(m, { twoUp: false, includeGlance: true }).length, 3);
    assert.equal(paginate(m, { twoUp: false, includeGlance: false }).length, 2);
    const two = paginate(m, { twoUp: true, includeGlance: true });
    assert.equal(two.length, 2);
    assert.equal(two[0]!.kind, "glance");
  });

  it("labels", () => {
    assert.equal(periodLabel("2026-02-01", "2026-02-28"), "February 2026");
    assert.equal(periodKey("2026-12-01", "2026-12-31"), "2026-12");
    assert.equal(pdfFileName({ from: "2026-10-01", to: "2026-10-31", revision: 3 }), "HiSchool_2026-10_rev3.pdf");
    assert.equal(warningSentence({ open: 2, violations: 1, overrides: 0 }), "Posted with 2 open shifts and 1 problem.");
    assert.equal(warningSentence({ open: 0, violations: 0, overrides: 0 }), "");
    assert.equal(warningSentence({ open: 1, violations: 2, overrides: 3 }), "Posted with 1 open shift, 2 problems and 3 accepted exceptions.");
  });
});

describe("pdf", () => {
  it("writes a PDF for every option combination", () => {
    const { snapshot, world: w } = post(world(), "2026-10-01", "2026-10-31");
    const m = snapshotToPrintModel(snapshot, w.state);
    for (const paper of ["letter", "tabloid"] as const) {
      for (const twoUp of [false, true]) {
        for (const grayscale of [false, true]) {
          const bytes = Buffer.from(buildPacketBytes(m, { paper, typeSize: twoUp ? "normal" : "large", grayscale, twoUp, punch: twoUp, includeGlance: true }));
          assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-");
          assert.ok(bytes.length > 2000);
        }
      }
    }
  });
});
