// Guards for two house rules, so a new screen can't quietly break them.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const COMPONENTS = path.resolve(import.meta.dirname, "../../components");
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
const lines = (f: string) => fs.readFileSync(f, "utf8").split("\n").map((text, i) => ({ text, n: i + 1 }));

describe("house rules", () => {
  it("screens show a store through storeTag / useStoreTag, never its raw letters", () => {
    // JSX text like <b>{store.code}</b>. The Stores page lists letters on purpose (its Letters column and the Edit form).
    const raw = /(>\s*\{[\w.]*\.code\}|\{[\w.]*\.code\}\s*<)/;
    const bad = files(COMPONENTS)
      .filter((f) => !f.endsWith("stores-screen.tsx"))
      .flatMap((f) => lines(f).filter((l) => raw.test(l.text)).map((l) => `${path.relative(COMPONENTS, f)}:${l.n}`));
    assert.deepEqual(bad, [], `these show raw store letters; use useStoreTag(): ${bad.join(", ")}`);
  });

  it("no screen writes the grid itself: names go in through the store, which goes through placeName", () => {
    const bad = files(COMPONENTS).filter((f) => /\bsetCellValue\b/.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(COMPONENTS, f));
    assert.deepEqual(bad, [], `these write the grid directly: ${bad.join(", ")}`);
  });
});
