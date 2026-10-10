// The domain must be deterministic and headless. This fails the build if a clock, randomness, locale sorting or a browser/React import
// creeps into src/domain (tests excluded).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const files = readdirSync(here).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

const banned: [RegExp, string][] = [
  [/\bnew Date\b|\bDate\.(now|UTC|parse)\b|\bDate\(/, "Date / wall clock"],
  [/Math\.random|crypto\.getRandomValues|randomUUID/, "randomness"],
  [/performance\.now|setTimeout|setInterval|requestAnimationFrame/, "timers / clock limits"],
  [/localeCompare|toLocale\w*|Intl\./, "locale-dependent behaviour"],
  [/from\s+["'](react|react-dom|zustand|@tanstack|node:|fs|path)/, "framework or Node import"],
  [/\b(window|document|localStorage|indexedDB|navigator)\b/, "browser global"],
];

test("src/domain has no clock, randomness, locale sorting, framework or browser use", () => {
  assert.ok(files.length >= 5);
  for (const f of files) {
    const src = readFileSync(new URL(f, here), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [re, why] of banned) assert.ok(!re.test(src), `${f}: ${why} (${re})`);
  }
});

test("plain .sort() is never called without a comparator", () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, here), "utf8");
    assert.ok(!/\.sort\(\s*\)/.test(src), `${f}: .sort() without a comparator`);
  }
});
