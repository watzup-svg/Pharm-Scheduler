// The random-click stress, a few seeds at a time. Each seed is independent (its own server, browser and recorded action list), so this
// gives the same coverage as `SEEDS=n node stress/v3-monkey.mjs` in about a third of the time. STRESS_JOBS=1 runs them one by one.
//   SEEDS=12 ACTIONS=150 node stress/v3-monkey-parallel.mjs
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const seeds = Number(process.env.SEEDS ?? 6);
const jobs = Math.max(1, Number(process.env.STRESS_JOBS ?? Math.min(3, cpus().length - 1)));
const t0 = Date.now();
let bad = 0, actions = 0, next = 1;
const one = (seed) => new Promise((done) => {
  const p = spawn("node", ["--experimental-strip-types", "--no-warnings", path.join(here, "v3-monkey.mjs")], { env: { ...process.env, SEED: String(seed), SEEDS: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => {
    const m = /(\d+) actions/.exec(out);
    if (m) actions += Number(m[1]);
    if (code !== 0 || /^FAIL/m.test(out)) { bad++; console.log(`FAIL seed ${seed}\n${out.trim().split("\n").slice(-40).join("\n")}`); } else console.log(`ok   seed ${seed}: ${m ? m[1] : "?"} actions`);
    done();
  });
});
await Promise.all(Array.from({ length: Math.min(jobs, seeds) }, async () => { while (next <= seeds) await one(next++); }));
console.log(`${bad ? "FAIL" : "ok  "} ${seeds} seed(s), ${actions} actions, ${bad} failing seed(s), ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(bad ? 1 : 0);
