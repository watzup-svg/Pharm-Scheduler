// `npm run audit`: the big read-only health audit. No AI tokens. Writes everything to test-logs/audit-<stamp>/ and prints a few lines.
//   node scripts/audit.mjs [--seeds 300] [--no-deep]
// Steps (side by side where they don't fight over the CPU): static analysis, engine timings, unit coverage, dependency scan,
// a big seed sweep, then the full deep run. scripts/audit/report.py merges the JSON into REPORT.md.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const seeds = args.includes("--seeds") ? Number(args[args.indexOf("--seeds") + 1]) : 300;
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const dir = path.join(root, "test-logs", `audit-${stamp}`);
fs.mkdirSync(dir, { recursive: true });
const node = process.execPath;
const strip = ["--experimental-strip-types", "--no-warnings"];
const results = [];

const run = (name, cmd, argv, opts = {}) =>
  new Promise((done) => {
    const t0 = Date.now();
    const log = fs.createWriteStream(path.join(dir, `${name}.log`));
    const child = spawn(cmd, argv, { cwd: root, env: { ...process.env, ...opts.env } });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("close", (code) => {
      log.end();
      results.push({ name, ok: code === 0, secs: +((Date.now() - t0) / 1000).toFixed(1) });
      console.log(`${code === 0 ? "ok  " : "FAIL"} ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      done();
    });
  });

// Light jobs first, together.
await Promise.all([
  run("analyze", node, [...strip, "scripts/audit/analyze.mjs", path.join(dir, "analyze.json")]),
  run("perf", node, [...strip, "scripts/audit/perf.mjs", path.join(dir, "perf.json")]),
  run("coverage", node, [...strip, "--experimental-test-coverage", "--test", ...fs.readdirSync(path.join(root, "src/lib/schedule")).filter((f) => f.endsWith(".test.ts")).map((f) => `src/lib/schedule/${f}`), "src/store/schedule-store.test.ts"]),
  run("npm-outdated", "npm", ["outdated", "--json"]),
  run("npm-audit", "npm", ["audit", "--json"]),
]);
// Then the CPU-heavy ones one after another.
await run("sweep", node, ["scripts/sweep.mjs", "--seeds", String(seeds), "--jobs", String(Math.max(2, os.cpus().length - 1))]);
if (!args.includes("--no-deep")) await run("deep", "npm", ["run", "deep"]);

fs.writeFileSync(path.join(dir, "steps.json"), JSON.stringify(results, null, 1));
const py = spawnSync("python3", ["scripts/audit/report.py", dir, root], { cwd: root, encoding: "utf8" });
console.log(py.stdout.trim() || py.stderr.trim());
console.log(`report: ${path.relative(root, path.join(dir, "REPORT.md"))}`);
process.exit(results.every((r) => r.ok) && py.status === 0 ? 0 : 1);
