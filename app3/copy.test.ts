import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDate, fmtRange, plural } from "./copy.ts";

test("dates read like the old app", () => {
  assert.equal(fmtDate("2026-10-06"), "Tue Oct 6");
  assert.equal(fmtRange("2026-10-06", "2026-10-06"), "Tue Oct 6");
  assert.equal(fmtRange("2026-10-06", "2026-10-08"), "Tue Oct 6 to Thu Oct 8");
  assert.equal(plural(1, "problem"), "1 problem");
  assert.equal(plural(0, "problem"), "0 problems");
});
