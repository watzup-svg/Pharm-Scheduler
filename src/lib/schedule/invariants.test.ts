// Promises the engine keeps after any run of edits. Seeded like fuzz.test.ts: `FUZZ_SEED` / `FUZZ_EDITS` change the run, and
// `npm run sweep` runs this file under many seeds at once.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { createSample } from "./sample.ts";
import { evaluate } from "./rules.ts";
import { placeName } from "./place.ts";
import { parseDoc, serializeDoc } from "./file.ts";
import { daysInMonth } from "./calendar.ts";
import { getCell } from "./grid.ts";
import { RPH_SLOTS } from "./slots.ts";

let seed = Number(process.env.FUZZ_SEED ?? 4242) >>> 0;
const EDITS = Number(process.env.FUZZ_EDITS ?? 800);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;

describe("invariants after random edits", () => {
  for (const [label, make] of [["demo", createDemo], ["sample", createSample]] as const) {
    it(`${label}: placeName is the safe gate, and the rules and the file stay consistent`, () => {
      let doc = make();
      const names = doc.people.map((p) => p.name);
      for (let i = 0; i < EDITS; i++) {
        const store = pick(doc.stores).code;
        const day = 1 + Math.floor(rnd() * daysInMonth(doc.year, doc.month));
        const slot = pick([...RPH_SLOTS]);
        const name = rnd() < 0.15 ? "" : pick(names);
        const before = JSON.stringify(doc);
        const evBefore = evaluate(doc);
        const r = placeName(doc, store, slot, day, name);
        assert.equal(JSON.stringify(doc), before, "placeName changed the document it was given");
        if (!r.ok) assert.deepEqual(r.doc, doc, `a refused placement (${r.reason}) still changed the document`);
        if (r.reason === "shut") assert.equal(getCell(r.doc.grid, store, slot, day), getCell(doc.grid, store, slot, day), "a name was written on a shut day");
        const evAfter = evaluate(r.doc);
        if (name) {
          assert.ok(evAfter.closed <= evBefore.closed, "placing a name added a name on a closed day");
          assert.ok(evAfter.unlicensed <= evBefore.unlicensed, "placing a name added an unlicensed placement");
        }
        // Nobody fills both rows of one store on one day.
        const cells = RPH_SLOTS.map((s) => getCell(r.doc.grid, store, s, day).trim()).filter(Boolean);
        assert.equal(new Set(cells).size, cells.length, `${store} day ${day} has one person in two rows`);
        doc = r.doc;
        if (i % 200 === 0) {
          assert.deepEqual(evaluate(doc), evaluate(doc), "evaluate is not repeatable");
          assert.equal(evaluate(doc).ready, evaluate(doc).holes + evaluate(doc).closed + evaluate(doc).doubles + evaluate(doc).unlicensed === 0, "ready disagrees with the hard-problem counts");
          const once = serializeDoc(parseDoc(serializeDoc(doc)));
          assert.equal(serializeDoc(parseDoc(once)), once, "saving and opening again keeps changing the file");
        }
      }
    });
  }
});
