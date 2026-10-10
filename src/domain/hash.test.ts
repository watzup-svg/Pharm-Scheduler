import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256 } from "./hash.ts";

test("sha256 matches the known vectors", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sha256 agrees with node:crypto on lengths around the block boundary and on unicode", () => {
  for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000, 100_000]) {
    const s = "a".repeat(n);
    assert.equal(sha256(s), createHash("sha256").update(s).digest("hex"), `length ${n}`);
  }
  const u = "Zoë 😀 薬剤師 \u0000 line\nbreak";
  assert.equal(sha256(u), createHash("sha256").update(u).digest("hex"));
});
