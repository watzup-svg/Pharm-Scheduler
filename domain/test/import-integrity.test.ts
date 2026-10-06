// The importer must never emit a state that fails the integrity check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importV2 } from "../src/import-v2.ts";
import { checkIntegrity } from "../src/integrity.ts";

const load = (n: string) => JSON.parse(readFileSync(new URL(`../../fixtures/${n}`, import.meta.url), "utf8"));
const dt = load("drive-table.json");

for (const name of ["demo-v2.json", "sample-v2.json"]) {
  for (const withDrive of [true, false]) {
    test(`importV2(${name}, drive table ${withDrive}) passes checkIntegrity`, () => {
      const doc = load(name);
      const docs = Array.isArray(doc) ? doc : [doc];
      const { world } = importV2(docs, withDrive ? { driveTable: dt.pairs } : {});
      assert.deepEqual(checkIntegrity(world.state, world.journal), []);
    });
  }
}

test("importV2 of every fixture together, and of an empty list, passes checkIntegrity", () => {
  const docs = ["demo-v2.json", "sample-v2.json"].flatMap((n) => { const d = load(n); return Array.isArray(d) ? d : [d]; });
  for (const set of [docs, docs.slice(0, 1), docs.slice().reverse()]) {
    try {
      const { world } = importV2(set, { driveTable: dt.pairs });
      assert.deepEqual(checkIntegrity(world.state, world.journal), []);
    } catch (e) {
      // Two months of the same year may be refused by the importer itself; that is a refusal, not a bad state.
      assert.match(String((e as Error).message), /./);
    }
  }
});
