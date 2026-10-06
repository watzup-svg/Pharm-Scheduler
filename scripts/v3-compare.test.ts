import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDoc } from "../src/lib/schedule/file.ts";
import { createSample } from "../src/lib/schedule/sample.ts";
import { createDemo } from "../src/lib/schedule/demo.ts";
import { compareDocs } from "./v3-compare.ts";

test("demo and sample months import with no unexplained differences", () => {
  for (const [name, doc] of [["sample", createSample()], ["demo", createDemo()]] as const) {
    const { rows } = compareDocs([doc]);
    for (const r of rows) assert.deepEqual(r.unexplained, [], `${name} ${r.month}`);
  }
});

test("saved v2 fixture imports", () => {
  const doc = parseDoc(readFileSync(new URL("../src/lib/schedule/fixtures/saved-v2.json", import.meta.url), "utf8"));
  const { rows } = compareDocs([doc]);
  assert.deepEqual(rows[0]!.unexplained, []);
});
