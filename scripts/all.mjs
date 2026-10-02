// `npm run all`: everything that checks the app, side by side, with a short summary on the screen and full output in test-logs/.
//   npm run all                 build the sample app, then type check, unit tests and the browser suite at the same time
//   npm run all -- --no-build   reuse the existing dist-spa
//   npm run all -- --sweep 40   also run the random-schedule sweep (40 seeds), see scripts/sweep.mjs
//   npm run deep                 everything above plus the sweep (engine promises under random edits) and the page sweep
//                                (every page and popup at laptop and phone width, notes, store letters, overflow, screenshots)
// Nothing here uses the network or any model. Two runs at once are fine (each picks its own port and scratch folder).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const logDir = path.join(root, "test-logs");
fs.mkdirSync(logDir, { recursive: true });

function job(name, cmd, cmdArgs, extraEnv = {}) {
  const t0 = Date.now();
  return new Promise((done) => {
    let out = "";
    const child = spawn(cmd, cmdArgs, { cwd: root, env: { ...process.env, ...extraEnv } });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const secs = Math.round((Date.now() - t0) / 1000);
      const file = path.join(logDir, `${name.replace(/\W+/g, "-")}-${stamp}.log`);
      fs.writeFileSync(file, out);
      console.log(`${code === 0 ? "ok  " : "FAIL"} ${name} (${secs}s)`);
      done({ name, code, secs, file, out });
    });
  });
}

const t0 = Date.now();
if (!args.includes("--no-build")) {
  const b = await job("build", "sh", ["-c", "npm run build:trial && npm run build:real"]);
  if (b.code !== 0) { console.log(b.out.split("\n").slice(-25).join("\n")); process.exit(1); }
}
const sweepAt = args.indexOf("--sweep");
const deep = args.includes("--deep");
const sweepSeeds = sweepAt >= 0 ? args[sweepAt + 1] ?? "40" : deep ? "30" : null;
const jobs = [
  job("type check", "npx", ["tsc", "--noEmit"]),
  job("unit tests", "npm", ["run", "test:schedule"]),
  job("browser suite", "node", ["e2e/run.mjs"]),
  job("guards", "node", ["scripts/guards.mjs"]),
  ...(sweepSeeds ? [job("sweep", "node", ["scripts/sweep.mjs", "--seeds", sweepSeeds, "--jobs", "2"])] : []),
  ...(deep ? [job("page sweep", "node", ["scripts/screens.mjs", "--jobs", "1"])] : []),
];
const results = await Promise.all(jobs);
const bad = results.filter((r) => r.code !== 0);
// A failed job shows its first few FAIL lines (or its last lines if it has none) and where the full output is.
for (const r of bad) {
  const lines = r.out.trim().split("\n");
  const fails = lines.filter((l) => /^FAIL|FAIL |not ok|Error/.test(l));
  console.log(`\n# ${r.name} (failed)\n${(fails.length ? fails.slice(0, 8) : lines.slice(-12)).join("\n")}\nfull output: ${path.relative(root, r.file)}`);
}
const summary = { at: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), results: results.map(({ name, code, secs, file }) => ({ name, ok: code === 0, secs, log: path.relative(root, file) })) };
fs.writeFileSync(path.join(logDir, "latest.json"), JSON.stringify(summary, null, 2));
console.log(bad.length ? `\n${bad.length} of ${results.length} failed` : `\nall passed in ${summary.secs}s (logs in test-logs/)`);
process.exit(bad.length ? 1 : 0);
