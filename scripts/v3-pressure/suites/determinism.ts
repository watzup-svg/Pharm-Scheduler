// determinism: the same input twice in this process, once more in a FRESH child process (with a different TZ and locale), and with every input list shuffled => identical hashes.
// A digest covers: world hash, evaluate, Build proposal, state after accepting it, Repair options, Improve proposal.
// Replay one case: node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/determinism.ts --level low --case licensing-hostile-n18-m0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { api, canonical, seedWorld, sha256, stateHash } from "../../../domain/src/index.ts";
import type { World } from "../../../domain/src/api-types.ts";
import { Invariant, WORLD_KINDS, genSeed, genWorld, monthEnd, monthStart, parseArgs, pick3, rng, runSuite, type Case, type WorldKind } from "../lib.ts";

const SELF = fileURLToPath(import.meta.url);
const h = (x: unknown) => sha256(canonical(x)).slice(0, 16);

function digest(kind: WorldKind, stores: number, m: number, shuffleSeed = 0): Record<string, string> {
  const start = monthStart(m), end = monthEnd(start);
  const range = { from: start, to: end };
  const seed = m * 31 + WORLD_KINDS.indexOf(kind) + 1;
  let w: World;
  if (shuffleSeed) {
    const base = genSeed({ seed, stores, kind, start, days: Number(end.slice(8)) });
    const r = rng(shuffleSeed);
    w = seedWorld({ ...base, stores: r.shuffle(base.stores), pharmacists: r.shuffle(base.pharmacists), assignments: r.shuffle(base.assignments!), unavailability: r.shuffle(base.unavailability!), travel: r.shuffle(base.travel!), standing: r.shuffle(base.standing!), dateOverrides: r.shuffle(base.dateOverrides!) });
  } else w = genWorld({ seed, stores, kind, start, days: Number(end.slice(8)) });
  const asOf = start;
  const out: Record<string, string> = { world: stateHash(w.state) };
  out.evaluate = h(api.evaluate(w.state, asOf, { range }));
  const b = api.build(w, range, asOf);
  out.build = h(b);
  let cur = w;
  if (b.proposal) {
    const o = api.openProposal(w, b.proposal);
    if (!("refused" in o)) { const c = api.acceptProposal(o); if (!("refused" in c)) cur = c.world; }
  }
  out.afterBuild = stateHash(cur.state);
  const ev = api.evaluate(cur.state, asOf, { range });
  const gaps = Object.values(ev.cells).filter((c) => c.open > 0).slice(0, 3).map((c) => ({ storeId: c.storeId, date: c.date }));
  out.repair = h(gaps.length ? api.repair(cur, gaps, {}, asOf) : null);
  out.improve = h(api.improve(cur, { ...range, includeNext14: true }, asOf));
  return out;
}

const args = parseArgs();
const L = args.level;

if (args.raw.digest) {
  // child mode: print one digest as JSON and exit
  const [kind, n, m, sh] = args.raw.digest.split(",");
  console.log("DIGEST " + JSON.stringify(digest(kind as WorldKind, Number(n), Number(m), Number(sh ?? 0))));
  process.exit(0);
}

function detCase(kind: WorldKind, stores: number, m: number): Case {
  const id = `${kind}-n${stores}-m${m}`;
  const replay = `node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/determinism.ts --level ${L} --case ${id}`;
  return {
    id,
    budgetMs: 90000 * (stores / 18),
    run(ctx) {
      const diff = (a: Record<string, string>, b: Record<string, string>, what: string) => {
        const bad = Object.keys(a).filter((k) => a[k] !== b[k]);
        if (bad.length) throw new Invariant("nondeterministic", `${what}: ${bad.map((k) => `${k} ${a[k]} vs ${b[k]}`).join("; ")}`, { replay, stateHash: a.world });
      };
      const a = digest(kind, stores, m);
      const b = digest(kind, stores, m);
      diff(a, b, "second run in the same process");
      const s = digest(kind, stores, m, 77 + m);
      diff(a, s, "inputs shuffled (stores, pharmacists, assignments, ... in a different order)");
      // fresh process, other time zone and locale
      for (const env of [{ TZ: "Pacific/Auckland", LANG: "de_DE.UTF-8" }, { TZ: "America/Los_Angeles", LANG: "C" }]) {
        const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", SELF, "--level", L, "--digest", `${kind},${stores},${m}`], { encoding: "utf8", env: { ...process.env, ...env }, timeout: 120000 });
        const line = (r.stdout ?? "").split("\n").find((x) => x.startsWith("DIGEST "));
        if (!line) throw new Invariant("child-failed", `child process (TZ=${env.TZ}) gave no digest: ${(r.stderr ?? "").slice(-300) || `exit ${r.status}`}`, { replay });
        diff(a, JSON.parse(line.slice(7)), `fresh process, TZ=${env.TZ}`);
      }
      ctx.note(`world ${a.world!.slice(0, 8)} build ${a.build!.slice(0, 8)} (same, shuffled, 2 child processes)`);
    },
  };
}

const plan: [number, number[], WorldKind[]][] = [
  [18, pick3(L, [0], [0, 1], [0, 1, 2]), pick3(L, ["normal", "licensing-hostile"], WORLD_KINDS, WORLD_KINDS)],
  [40, pick3(L, [], [0], [0, 1]), pick3(L, [], ["normal"], ["normal", "dense", "closed-weeks"])],
];
const cases: Case[] = [];
for (const [n, months, kinds] of plan) for (const m of months) for (const k of kinds) cases.push(detCase(k, n, m));
await runSuite("determinism", cases, args);
