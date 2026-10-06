import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256 } from "../src/hash.ts";
import { canonical, clone } from "../src/canonical.ts";

test("sha256 matches node crypto", () => {
  for (const s of ["", "abc", "é☃𝄞", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000)]) {
    assert.equal(sha256(s), createHash("sha256").update(s, "utf8").digest("hex"), JSON.stringify(s.slice(0, 8)));
  }
});

test("canonical is order independent and drops undefined", () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
  assert.deepEqual(clone({ a: [1, { b: undefined, c: 2 }] }), { a: [1, { c: 2 }] });
});
