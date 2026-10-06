import { test } from "node:test";
import assert from "node:assert/strict";
import { cut, shortName, shortNames } from "./names.ts";

test("full name when it fits, initial + last when not, ellipsis last", () => {
  assert.equal(shortName("Fenn Ritter", 20), "Fenn Ritter");
  assert.equal(shortName("Marisol Quenby", 12), "M. Quenby");
  assert.equal(shortName("Marisol Quenby", 6), "M. Qu…");
  assert.equal(shortName("Cher", 3), "Ch…");
});
test("two people who would read the same keep their full names", () => {
  const m = shortNames([{ id: "a", name: "Anders Kowal" }, { id: "b", name: "Alma Kowal" }, { id: "c", name: "Yara Bellamy" }], 11);
  assert.equal(m.get("a"), "Anders Kow…");
  assert.equal(m.get("c"), "Yara Bellamy".length <= 11 ? "Yara Bellamy" : "Y. Bellamy");
});
test("cut counts code points", () => {
  assert.equal(cut("𝄞𝄞𝄞𝄞", 3), "𝄞𝄞…");
});
