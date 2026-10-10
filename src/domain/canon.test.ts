import test from "node:test";
import assert from "node:assert/strict";
import { canon, compareCodePoints } from "./canon.ts";

test("keys are sorted by code point, not by UTF-16 unit and not by locale", () => {
  // U+FF5E is below U+1F600 by code point, but its UTF-16 unit (FF5E) is above the emoji's lead surrogate (D83D).
  assert.equal(compareCodePoints("～", "\u{1F600}"), -1);
  assert.ok("～" > "\u{1F600}", "plain < would get this wrong");
  assert.equal(canon({ "\u{1F600}": 1, "～": 2, B: 3, a: 4, "ä": 5 }), '{"B":3,"a":4,"ä":5,"～":2,"\u{1F600}":1}');
});

test("same data in any key order gives the same text", () => {
  assert.equal(canon({ a: 1, b: { y: [1, 2], x: null } }), canon({ b: { x: null, y: [1, 2] }, a: 1 }));
});

test("only integers, no undefined, -0 becomes 0", () => {
  assert.throws(() => canon(1.5));
  assert.throws(() => canon(NaN));
  assert.throws(() => canon({ a: undefined } as never));
  assert.equal(canon(-0), "0");
});
