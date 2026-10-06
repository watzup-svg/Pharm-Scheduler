// choicesFor judges candidates with evalDelta; this keeps it identical to the original (full evaluate of a scratch copy per candidate).
import { test } from "node:test";
import assert from "node:assert/strict";
import { choicesFor } from "../src/choices.ts";
import { choicesForRef } from "./choices-equiv.ref.ts";
import { genWorld, WORLD_KINDS, rng } from "../../scripts/v3-pressure/lib.ts";

for (const kind of WORLD_KINDS) {
  test(`choicesFor equals the full-evaluate reference (${kind})`, () => {
    const w = genWorld({ seed: 11, stores: 12, kind, start: "2026-10-01", days: 31 });
    const r = rng(77);
    const stores = Object.keys(w.state.stores);
    let nonEmpty = 0;
    for (let i = 0; i < 8; i++) {
      const storeId = stores[r.int(stores.length)]!;
      const date = `2026-10-${String(1 + r.int(31)).padStart(2, "0")}`;
      const asOf = i % 2 ? "2026-10-06" : "2026-10-20";
      const a = choicesFor(w.state, storeId, date, asOf);
      const b = choicesForRef(w.state, storeId, date, asOf);
      if (b.length) nonEmpty++;
      assert.deepEqual(a, b, `${storeId} ${date} asOf ${asOf}`);
    }
    assert.ok(nonEmpty > 0);
  });
}
