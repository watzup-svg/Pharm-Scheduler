import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluate } from "../lib/schedule/rules.ts";
import { createSample, SAMPLE_FILE_NAME } from "../lib/schedule/sample.ts";
import { useScheduleStore } from "./schedule-store.ts";

// Random edits, then undo them one by one: every step must give back exactly the document from before that edit, and redo must land on the
// same final document. The same property for many seeds, so an edit that forgets to be undoable (or undoes too much) shows up.
if (typeof globalThis.localStorage === "undefined") {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, String(v)), removeItem: (k: string) => void data.delete(k), clear: () => data.clear(), key: (i: number) => [...data.keys()][i] ?? null, get length() { return data.size; } },
    configurable: true,
  });
}

const rng = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const seeds = Number(process.env.UNDO_SEEDS ?? 25);

function fresh() {
  const doc = createSample();
  useScheduleStore.setState({ doc, evaluation: evaluate(doc), dirty: false, fileName: SAMPLE_FILE_NAME, handle: null, undoStack: [], redoStack: [], hydrated: false });
}
const snap = () => JSON.stringify(useScheduleStore.getState().doc);

describe("undo and redo round trip", () => {
  for (let seed = 1; seed <= seeds; seed++) {
    it(`seed ${seed}`, () => {
      fresh();
      const rnd = Object.assign(rng(seed), {});
      const st = () => useScheduleStore.getState();
      const before: string[] = [];
      let extra = 0;
      for (let i = 0; i < 30; i++) {
        const doc = st().doc;
        const store = doc.stores[Math.floor(rnd() * doc.stores.length)]!.code;
        const person = doc.people[Math.floor(rnd() * doc.people.length)]!.name;
        const day = 1 + Math.floor(rnd() * 28);
        const depth = st().undoStack.length;
        const was = snap();
        const k = Math.floor(rnd() * 5);
        if (k === 0) st().setCell(store, "pharmacist", day, person);
        else if (k === 1) st().setCell(store, "pharmacist2", day, "");
        else if (k === 2) st().placeNames(store, day, [{ slot: "pharmacist", name: person }]);
        else if (k === 3) st().placeMany([{ store, slot: "pharmacist2", day, name: person }]);
        else st().addPerson({ ...doc.people[0]!, name: `Round Trip ${seed}-${extra++}` });
        if (st().undoStack.length > depth) before.push(was); // an edit that was refused leaves no step, and nothing to undo
      }
      assert.ok(before.length >= 5, `only ${before.length} of 30 edits took effect: the test is not testing much`);
      const final = snap();
      for (let i = before.length - 1; i >= 0; i--) {
        st().undo();
        assert.equal(snap(), before[i], `undo step ${i} did not restore the document from before that edit`);
      }
      for (let i = 0; i < before.length; i++) st().redo();
      assert.equal(snap(), final, "redo did not return to the final document");
    });
  }
});
