// `npm run sweep`: push many random schedules through the rules engine (the fuzz and invariant tests under different seeds), side by side.
//   npm run sweep                         40 seeds, one process per core
//   npm run sweep -- --seeds 200          more seeds
//   npm run sweep -- --edits 5000         longer random runs per seed (default 1500)
//   npm run sweep -- --from 1000          seeds 1000, 1001, ... (default 1)
// Results are written to test-logs/sweep-<stamp>.json (one row per seed, with the failing message). The screen shows a short summary.
// A failing seed reproduces alone: FUZZ_SEED=<seed> npm run test:schedule
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const get = (flag, dflt) => (args.includes(flag) ? Number(args[args.indexOf(flag) + 1]) : dflt);
const seeds = get("--seeds", 40);
const from = get("--from", 1);
const edits = get("--edits", 1500);
const width = Math.max(1, Math.min(get("--jobs", os.cpus().length), seeds));
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
fs.mkdirSync(path.join(root, "test-logs"), { recursive: true });

const rows = [];
const t0 = Date.now();
const one = (seed) =>
  new Promise((done) => {
    const s0 = Date.now();
    let out = "";
    const child = spawn(process.execPath, ["--experimental-strip-types", "--test", "src/lib/schedule/fuzz.test.ts", "src/lib/schedule/invariants.test.ts"], { cwd: root, env: { ...process.env, FUZZ_SEED: String(seed), FUZZ_EDITS: String(edits) } });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const fail = out.split("\n").filter((l) => /not ok|AssertionError|Error:/.test(l)).slice(0, 4).join(" | ");
      rows.push({ seed, ok: code === 0, secs: +((Date.now() - s0) / 1000).toFixed(1), ...(code === 0 ? {} : { failure: fail || out.trim().split("\n").slice(-3).join(" | ") }) });
      done();
    });
  });
const queue = Array.from({ length: seeds }, (_, i) => from + i);
await Promise.all(Array.from({ length: width }, async () => { for (let s = queue.shift(); s != null; s = queue.shift()) await one(s); }));
rows.sort((a, b) => a.seed - b.seed);
const file = path.join(root, "test-logs", `sweep-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify({ seeds, from, edits, secs: Math.round((Date.now() - t0) / 1000), rows }, null, 2));
const bad = rows.filter((r) => !r.ok);
for (const r of bad.slice(0, 10)) console.log(`FAIL seed ${r.seed}: ${r.failure}`);
console.log(bad.length ? `${bad.length} of ${rows.length} seeds failed. Reproduce one: FUZZ_SEED=${bad[0].seed} npm run test:schedule` : `all ${rows.length} seeds passed (${edits} edits each) in ${Math.round((Date.now() - t0) / 1000)}s`);
console.log(`results: ${path.relative(root, file)}`);
process.exit(bad.length ? 1 : 0);
