// Timing regression guard for the domain, on the quick deterministic perf scripts (no browser, no network).
//   node scripts/v3-perf-baseline.mjs                compare with scripts/perf-baseline.json
//   UPDATE=1 node scripts/v3-perf-baseline.mjs       (re)write the baseline from this machine; commit the file
//   RUNS=3 node scripts/v3-perf-baseline.mjs         take the best of 3 instead of 2
// Each script runs one at a time (best of 2 runs, per metric). A metric fails when it is more than 40% AND more than 150 ms slower than its
// baseline: both conditions, because shared CPUs are noisy and a 30 ms step that doubles is not news. The baseline records the machine's core count; a
// baseline taken on a different core count is still used (the check is generous) but says so.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(root, "scripts", "perf-baseline.json");
const RUNS = Number(process.env.RUNS ?? 2);
const UPDATE = process.env.UPDATE === "1";
const REL = 1.4;
const ABS_MS = 150;

// [script, extra args] per metric group. v3-perf-ops takes the operation as its argument.
const JOBS = [
  ["v3-perf-eval.ts", []],
  ["v3-perf-build.ts", []],
  ["v3-perf-buildonly.ts", []],
  ["v3-perf.ts", []],
  ["v3-perf-ops.ts", ["repair5"]],
  ["v3-perf-ops.ts", ["repair5w"]],
  ["v3-perf-ops.ts", ["build"]],
  ["v3-perf-ops.ts", ["improve"]],
];

/** Pull "name ... N ms" and "name ms N" lines out of a script's output. */
function parse(script, out) {
  const m = {};
  const seen = {};
  const put = (name, ms) => {
    const key = `${script}:${name.trim().replace(/\s+/g, " ")}`;
    seen[key] = (seen[key] ?? 0) + 1;
    m[seen[key] > 1 ? `${key}#${seen[key]}` : key] = Number(ms);
  };
  for (const line of out.split("\n")) {
    let r;
    if ((r = /^(?:assignments \d+ )?([A-Za-z][\w ()/,.+-]*?)\s+ms\s+(\d+)\b/.exec(line))) put(r[1], r[2]); // "build ms 2904 edits ...", "assignments 508 evaluate ms 31"
    else if ((r = /^([A-Za-z][\w ()/,.+-]*?)\s+(\d+)\s+ms\s*$/.exec(line))) put(r[1], r[2]); // "repair 1 gap   313 ms", "repair5 439 ms"
  }
  return m;
}

function runOnce(script, args) {
  const label = [script, ...args].join(" ");
  const r = spawnSync("node", ["--experimental-strip-types", "--no-warnings", path.join("scripts", script), ...args], { cwd: root, encoding: "utf8", timeout: 5 * 60_000 });
  if (r.status !== 0) throw new Error(`${label} failed (${r.status}): ${(r.stderr || r.stdout).slice(-300)}`);
  const m = parse(script + (args.length ? `(${args.join(",")})` : ""), r.stdout);
  if (!Object.keys(m).length) throw new Error(`${label}: no timings found in its output:\n${r.stdout.slice(-300)}`);
  return m;
}

const best = {};
const t0 = Date.now();
for (const [script, args] of JOBS) {
  for (let i = 0; i < RUNS; i++) {
    let m;
    try { m = runOnce(script, args); } catch (e) { console.error(`FAIL ${e.message}`); process.exit(1); }
    for (const [k, v] of Object.entries(m)) best[k] = Math.min(best[k] ?? Infinity, v);
  }
}

const cores = os.cpus().length;
if (UPDATE) {
  const sorted = Object.fromEntries(Object.entries(best).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(FILE, JSON.stringify({ note: "best of runs, ms; regenerate with UPDATE=1 node scripts/v3-perf-baseline.mjs", cores, cpu: os.cpus()[0]?.model ?? "?", node: process.version, runs: RUNS, metrics: sorted }, null, 2) + "\n");
  console.log(`wrote ${path.relative(root, FILE)}: ${Object.keys(sorted).length} metrics, ${cores} cores, best of ${RUNS} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  for (const [k, v] of Object.entries(sorted)) console.log(`  ${k.padEnd(52)} ${String(v).padStart(6)} ms`);
  process.exit(0);
}

if (!fs.existsSync(FILE)) { console.error(`FAIL no baseline at ${path.relative(root, FILE)}; run UPDATE=1 node scripts/v3-perf-baseline.mjs once and commit it`); process.exit(1); }
const base = JSON.parse(fs.readFileSync(FILE, "utf8"));
if (base.cores !== cores) console.log(`note baseline was taken on ${base.cores} cores, this machine has ${cores}; the limits are generous, but re-record if this keeps failing`);

const rows = [];
let bad = 0;
for (const k of Object.keys(best).sort()) {
  const now = best[k];
  const was = base.metrics[k];
  if (was === undefined) { rows.push({ k, now, was: null, verdict: "new" }); continue; }
  const slow = now > was * REL && now - was > ABS_MS;
  if (slow) bad++;
  rows.push({ k, now, was, verdict: slow ? "SLOWER" : now < was * 0.7 && was - now > ABS_MS ? "faster" : "ok" });
}
for (const k of Object.keys(base.metrics)) if (!(k in best)) rows.push({ k, now: null, was: base.metrics[k], verdict: "missing" });

console.log(`${"metric".padEnd(52)} ${"base".padStart(6)} ${"now".padStart(6)} ${"change".padStart(8)}  verdict`);
for (const r of rows) {
  const change = r.was && r.now !== null ? `${r.now >= r.was ? "+" : ""}${Math.round(((r.now - r.was) / r.was) * 100)}%` : "";
  console.log(`${r.k.padEnd(52)} ${String(r.was ?? "-").padStart(6)} ${String(r.now ?? "-").padStart(6)} ${change.padStart(8)}  ${r.verdict}`);
}
const missing = rows.filter((r) => r.verdict === "missing");
for (const r of rows.filter((x) => x.verdict === "SLOWER")) console.log(`FAIL ${r.k}: ${r.now} ms vs baseline ${r.was} ms (limit: +${Math.round((REL - 1) * 100)}% and +${ABS_MS} ms)`);
for (const r of missing) console.log(`FAIL ${r.k}: in the baseline but no longer produced; re-record with UPDATE=1`);
const newOnes = rows.filter((r) => r.verdict === "new").length;
if (newOnes) console.log(`note ${newOnes} metric(s) are not in the baseline yet (UPDATE=1 adds them)`);
console.log(`\n${rows.length} metrics, best of ${RUNS} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s, ${bad ? `${bad} slower than the limit` : "none slower than the limit"}`);
process.exit(bad || missing.length ? 1 : 0);
