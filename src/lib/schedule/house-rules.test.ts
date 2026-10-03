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

  it("press-and-hold is only for an action that cannot be undone, and says so", () => {
    // A <HoldButton> must have `// no-undo: <what is lost>` on one of the 3 lines above it. Anything undoable is a plain Button plus announce() (Undo toast).
    const bad = files(COMPONENTS)
      .filter((f) => !f.endsWith("hold-button.tsx"))
      .flatMap((f) => {
        const ls = lines(f);
        return ls.filter((l, i) => /<HoldButton\b/.test(l.text) && !ls.slice(Math.max(0, i - 3), i).some((p) => /no-undo:/.test(p.text))).map((l) => `${path.relative(COMPONENTS, f)}:${l.n}`);
      });
    assert.deepEqual(bad, [], `these hold buttons are not marked non-undoable (use a Button and announce() instead, or add "// no-undo: ..."): ${bad.join(", ")}`);
  });
});
