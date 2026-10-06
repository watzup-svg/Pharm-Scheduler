// Seeded mutations of the prototype export files that importV2 reads. importV2 may refuse ("Nothing to import.") but must never
// throw anything else; whatever world it returns must pass checkIntegrity (no fatal problems) and evaluate() must not throw.
// Reproduce a failing case with FUZZ_SEED=<seed> FUZZ_ONLY=<case index>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importV2 } from "../src/import-v2.ts";
import { checkIntegrity } from "../src/integrity.ts";
import { evaluate } from "../src/coverage.ts";

const load = (n: string) => JSON.parse(readFileSync(new URL(`../../fixtures/${n}`, import.meta.url), "utf8"));
const demo = load("demo-v2.json"), sample = load("sample-v2.json"), dt = load("drive-table.json");

function rng(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]!, chance: (p: number) => next() < p };
}
type R = ReturnType<typeof rng>;

const ODD_DATES = ["2026-02-30", "2026-13-01", "0000-00-00", "2026-00-10", "2026-10-32", "9999-12-31", "0001-01-01", "abc", "", "2026-1-5", "2026/10/05", "20261005", " 2026-10-05", "2026-10-05T00:00:00Z", "-2026-10-05", "\uff12\uff10\uff12\uff16-10-05", "2026-10-05\n", "1e3", "Infinity"];
const ODD_VALUES: (() => unknown)[] = [
  () => null, () => undefined, () => true, () => false, () => 0, () => -1, () => 1.5, () => 1e308, () => -1e308, () => Number.MAX_SAFE_INTEGER, () => 2 ** 53 + 2,
  () => "", () => " ", () => "x", () => "__proto__", () => "constructor", () => "toString", () => "hasOwnProperty", () => "ALL", () => "\u0000", () => "\ud800", () => "=1+1",
  () => "x".repeat(10000), () => [], () => {}, () => ({}), () => [[]], () => [null], () => [1, 2, 3], () => ({ a: 1 }), () => ODD_DATES, () => "2026-10-05", () => NaN,
];
const KEYS = ["__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty", "extra", "x-unknown", "0", "-1", "99", "1e3", ""];

type Path = (string | number)[];
function collect(v: unknown, path: Path, out: { path: Path; v: unknown }[], depth = 0): void {
  out.push({ path, v });
  if (depth > 6 || v === null || typeof v !== "object") return;
  const entries = Array.isArray(v) ? v.map((x, i) => [i, x] as const) : Object.entries(v as object);
  // Sample big containers so mutation points stay spread over the file, not all inside one huge array.
  const step = entries.length > 40 ? Math.ceil(entries.length / 40) : 1;
  for (let i = 0; i < entries.length; i += step) collect(entries[i]![1], [...path, entries[i]![0]], out, depth + 1);
}
const at = (root: unknown, path: Path): unknown => path.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)?.[k], root);
const setOwn = (o: object, k: string | number, v: unknown) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

function mutateOnce(doc: unknown, r: R, pool: unknown[]): unknown {
  const pts: { path: Path; v: unknown }[] = [];
  collect(doc, [], pts);
  const p = r.pick(pts);
  if (p.path.length === 0) return doc;
  const parent = at(doc, p.path.slice(0, -1)) as Record<string | number, unknown> | unknown[];
  const key = p.path[p.path.length - 1]!;
  const kind = r.int(13);
  switch (kind) {
    case 0: if (Array.isArray(parent)) parent.splice(Number(key), 1); else delete (parent as Record<string, unknown>)[key]; break; // drop
    case 1: (parent as Record<string | number, unknown>)[key] = null; break;
    case 2: case 3: (parent as Record<string | number, unknown>)[key] = r.pick(ODD_VALUES)(); break; // wrong type / odd value
    case 4: if (typeof p.v === "string") (parent as Record<string | number, unknown>)[key] = r.pick(ODD_DATES); else (parent as Record<string | number, unknown>)[key] = r.pick(ODD_VALUES)(); break;
    case 5: if (Array.isArray(parent)) parent.splice(Number(key), 0, structuredClone(p.v)); else if (parent && typeof parent === "object" && !Array.isArray(parent)) setOwn(parent, `${String(key)} `, structuredClone(p.v)); break; // duplicate id / name / entry
    case 6: if (p.v && typeof p.v === "object" && !Array.isArray(p.v)) setOwn(p.v, r.pick(KEYS), r.pick(ODD_VALUES)()); break; // extra / hostile key, own "__proto__" included
    case 7: if (Array.isArray(p.v) && p.v.length) { const n = 200 + r.int(1500); for (let i = 0; i < n; i++) p.v.push(structuredClone(p.v[r.int(p.v.length)])); } break; // huge array
    case 8: if (Array.isArray(p.v) && p.v.length) { const e = p.v[0] as Record<string, unknown>; if (e && typeof e === "object") for (let i = 0; i < 30; i++) p.v.push({ ...structuredClone(e), code: `Z${i}`, name: `Z${i}` }); } break; // many distinct entries
    case 9: if (p.v && typeof p.v === "object" && !Array.isArray(p.v)) { const o = p.v as Record<string, unknown>; const ks = Object.keys(o); if (ks.length) setOwn(o, r.pick(ks) + "x", o[r.pick(ks)]); } break;
    case 10: (parent as Record<string | number, unknown>)[key] = structuredClone(r.pick(pool)); break; // graft a piece from another file
    case 11: if (typeof p.v === "string") (parent as Record<string | number, unknown>)[key] = r.chance(0.5) ? p.v.toUpperCase() + " " : p.v.slice(0, r.int(p.v.length + 1)); break;
    default: if (typeof p.v === "number") (parent as Record<string | number, unknown>)[key] = r.pick([p.v + 1, p.v - 1, 0, -p.v, p.v * 1000, 13, 0.5]); break;
  }
  return doc;
}

/** A plausible series of months built from the sample file, so mixed monthly files exist. */
function monthly(r: R): unknown[] {
  const n = 1 + r.int(4);
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const d = structuredClone(r.chance(0.5) ? sample : demo) as Record<string, unknown>;
    d.year = r.pick([2025, 2026, 2026, 2027]);
    d.month = 1 + r.int(12);
    if (r.chance(0.4)) { const s = d.stores as { code: string }[]; d.stores = s.slice(0, 1 + r.int(s.length)); }
    if (r.chance(0.3) && Array.isArray(d.people)) d.people = (d.people as unknown[]).slice().reverse();
    out.push(d);
  }
  return out;
}

const poolOf = [demo, sample];
const N = Number(process.env.FUZZ_CASES ?? 2500);
const seed = Number(process.env.FUZZ_SEED ?? 20261006);
const only = process.env.FUZZ_ONLY === undefined ? null : Number(process.env.FUZZ_ONLY);

function makeCase(i: number): { docs: unknown[]; opts: { driveTable?: unknown } } {
  const r = rng(seed + i * 7919);
  const mode = r.int(10);
  let docs: unknown[];
  if (mode < 5) docs = [structuredClone(sample)];
  else if (mode < 6) docs = [structuredClone(demo)];
  else if (mode < 8) docs = monthly(r);
  else if (mode < 9) docs = [structuredClone(sample), structuredClone(demo)];
  else docs = [structuredClone(r.pick(poolOf)), r.pick([null, 7, "x", [], [[]], true, {}, { year: 2026, month: 10 }])];
  const mutations = 1 + r.int(5);
  for (let m = 0; m < mutations; m++) {
    const k = r.int(docs.length);
    docs[k] = mutateOnce(docs[k], r, poolOf);
  }
  if (r.chance(0.05)) docs = r.pick([[null], [undefined], [[]], [1, 2], [{}], ["x"]]);
  const opts: { driveTable?: unknown } = r.chance(0.6) ? { driveTable: structuredClone(dt.pairs) } : {};
  if (opts.driveTable && r.chance(0.3)) mutateOnce({ pairs: opts.driveTable }, r, poolOf);
  if (r.chance(0.1)) opts.driveTable = r.pick([null, 5, "x", [], [1, 2], { "A|B": 5 }, { "A|B": [] }, { "A|B": ["x", null] }, { "__proto__": [1, 2] }]);
  return { docs, opts };
}

test(`importV2 survives ${N} seeded mutations of the prototype files (seed ${seed})`, () => {
  let refused = 0, imported = 0;
  const messages = new Map<string, number>();
  for (let i = only ?? 0; i < (only === null ? N : only + 1); i++) {
    const { docs, opts } = makeCase(i);
    let res: ReturnType<typeof importV2>;
    try {
      res = importV2(docs, opts as Parameters<typeof importV2>[1]);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      messages.set(msg, (messages.get(msg) ?? 0) + 1);
      assert.equal(msg, "Nothing to import.", `case ${i}: importV2 threw ${(e as Error)?.stack ?? msg}`);
      refused++;
      continue;
    }
    imported++;
    const { world } = res;
    const issues = checkIntegrity(world.state, world.journal);
    assert.deepEqual(issues.filter((p) => p.fatal), [], `case ${i}: fatal integrity problems`);
    assert.doesNotThrow(() => evaluate(world.state, "2026-10-06"), `case ${i}: evaluate threw`);
    assert.doesNotThrow(() => JSON.stringify(world.state), `case ${i}: state is not plain data`);
  }
  console.log(`# import-fuzz: ${imported} imported, ${refused} refused with "Nothing to import."`);
  assert.ok(only !== null || imported > N / 4, "most mutated files should still import (the importer should skip bad parts, not refuse)");
});

test("importV2: fixed hostile files", () => {
  const hostile: unknown[][] = [
    [], [null], [undefined], [[]], [{}], [{ year: 2026, month: 10 }], [{ year: "2026", month: "10", stores: [], people: [] }],
    [{ year: 2026, month: 10, stores: "x", people: 5 }], [{ year: NaN, month: 10, stores: [], people: [] }], [{ year: 2026, month: 13, stores: [], people: [] }],
    [{ year: 2026, month: 0, stores: [], people: [] }], [{ year: 1e9, month: 1.5, stores: [], people: [] }],
    JSON.parse('[{"year":2026,"month":10,"stores":[{"code":"__proto__"},{"code":"constructor"}],"people":[{"name":"__proto__","role":"Pharmacist","home":"__proto__"}],"grid":{"__proto__":{"pharmacist":{"1":"__proto__"}}},"timeOff":[{"name":"__proto__","dates":["2026-10-05"]}]}]'),
  ];
  for (const docs of hostile) {
    try {
      const { world } = importV2(docs);
      assert.deepEqual(checkIntegrity(world.state, world.journal).filter((p) => p.fatal), []);
      evaluate(world.state, "2026-10-06");
    } catch (e) {
      assert.equal((e as Error).message, "Nothing to import.", JSON.stringify(docs).slice(0, 120) + " -> " + String((e as Error).stack));
    }
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined, "no prototype pollution");
});
