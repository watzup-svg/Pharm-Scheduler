import assert from "node:assert/strict";
import test from "node:test";

// The module swaps in memory storage when the browser refuses localStorage. Fake a window whose storage throws.
const refusing = () => {
  throw new Error("blocked");
};
const fake = { localStorage: { setItem: refusing, removeItem: refusing } } as unknown as Record<string, unknown>;
Object.defineProperty(globalThis, "window", { value: fake, configurable: true });

await import("./safe-storage.ts");

test("a window that refuses localStorage gets a working memory one", () => {
  const ls = (fake as unknown as { localStorage: Storage }).localStorage;
  ls.setItem("a", "1");
  assert.equal(ls.getItem("a"), "1");
  assert.equal(ls.length, 1);
  assert.equal(ls.key(0), "a");
  ls.removeItem("a");
  assert.equal(ls.getItem("a"), null);
  ls.setItem("b", "2");
  ls.clear();
  assert.equal(ls.length, 0);
});

test("sessionStorage is replaced too", () => {
  const ss = (fake as unknown as { sessionStorage?: Storage }).sessionStorage;
  assert.ok(ss);
  ss.setItem("x", "y");
  assert.equal(ss.getItem("x"), "y");
});
