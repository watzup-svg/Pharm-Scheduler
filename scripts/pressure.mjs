// `npm run pressure -- --level low|medium|high`: push the app past normal use and say OK or FAIL per test. No AI tokens.
//   low     about 2 min   every change set: damaged files, odd data, speed limits, squeezed screens, short soak
//   medium  about 10 min  nightly or before handing a build to someone
//   high    about 30 min  weekly, or before a big release: everything at full scale (120 stores, 500 people)
//   --only "fill*" runs just the four fill-suggestion tests (also: npm run fill -- --level low)
// Same tests at every level, only the scale changes. Needs `npm run build:trial` first. Detail: test-logs/pressure-<stamp>/<test>.log
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null; // run one test by name (CI runs each on its own machine)
const level = args.includes("--level") ? args[args.indexOf("--level") + 1] : "low";
if (!["low", "medium", "high"].includes(level)) { console.log("level must be low, medium or high"); process.exit(2); }
const L = { low: 0, medium: 1, high: 2 }[level];
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const dir = path.join(root, "test-logs", `pressure-${stamp}-${level}`);
fs.mkdirSync(dir, { recursive: true });
const node = process.execPath;
const strip = ["--experimental-strip-types", "--no-warnings"];
const withServer = (...rest) => [node, ["scripts/with-server.mjs", "trial", ...rest]];
const big = L === 2 ? [120, 500] : [40, 150];
const bigFile = path.join(dir, "big-month.json");

const jobs = [
  ["security scan", node, [...strip, "scripts/pressure/security.mjs", "scan", level]],
  ["hostile files", node, [...strip, "scripts/pressure/security.mjs", "files", level]],
  ["time zones (unit tests)", node, [...strip, "scripts/pressure/security.mjs", "zones", level]],
  ["markup injection", ...withServer(node, "scripts/pressure/browser.mjs", "injection", level)],
  ["time zones and languages", ...withServer(node, "scripts/pressure/browser.mjs", "zones", level)],
  ["damaged files", node, [...strip, "scripts/pressure/node.mjs", "fuzz", level]],
  ["odd data", node, [...strip, "scripts/pressure/node.mjs", "hostile", level]],
  ["big month and PDF", node, [...strip, "--expose-gc", "scripts/pressure/node.mjs", "big", level]],
  ["fill cases", node, [...strip, "scripts/pressure/fill.mjs", "cases", level]],
  ["fill rules", node, [...strip, "scripts/pressure/fill.mjs", "rules", level]],
  ["fill chains", node, [...strip, "scripts/pressure/fill.mjs", "chains", level]],
  ["fill scale", node, [...strip, "scripts/pressure/fill.mjs", "scale", level]],
  ["random schedules", node, ["scripts/sweep.mjs", "--seeds", String([30, 300, 1000][L]), "--jobs", String(only ? os.cpus().length : 2)]],
  ["storage full or refused", ...withServer(node, "scripts/pressure/browser.mjs", "storage", level)],
  ["interrupted by reloads", ...withServer(node, "scripts/pressure/browser.mjs", "interrupts", level)],
  ["squeezed and zoomed screens", ...withServer(node, "scripts/pressure/browser.mjs", "screens", level)],
  ["long session", ...withServer(node, "scripts/pressure/browser.mjs", "soak", level)],
  ...(L > 0 ? [["big month in the app", "sh", ["-c", `${node} ${strip.join(" ")} stress/big-doc.ts ${big[0]} ${big[1]} ${bigFile} && ${node} scripts/with-server.mjs trial ${node} stress/monkey.mjs ${L === 2 ? 150 : 120} 5 ${bigFile}`]]] : []),
];

const width = Math.max(2, os.cpus().length - 1);
const rows = [];
const t0 = Date.now();
const run = ([name, cmd, argv]) => new Promise((done) => {
  const t = Date.now();
  const file = path.join(dir, `${name.replace(/\W+/g, "-")}.log`);
  const log = fs.createWriteStream(file);
  let out = "";
  const child = spawn(cmd, argv, { cwd: root, env: { ...process.env, E2E_TMP: "" } });
  const keep = (d) => { out += d; log.write(d); };
  child.stdout.on("data", keep); child.stderr.on("data", keep);
  child.on("close", (code) => {
    log.end();
    const last = out.trim().split("\n").filter((l) => /^(ok  |FAIL)/.test(l)).pop();
    const why = code === 0 ? "" : (out.split("\n").find((l) => /^  ! |FAIL|Error/.test(l)) ?? out.trim().split("\n").slice(-1)[0] ?? "").trim();
    rows.push({ name, ok: code === 0, secs: Math.round((Date.now() - t) / 1000), why });
    console.log(`${code === 0 ? "ok  " : "FAIL"} ${name} (${Math.round((Date.now() - t) / 1000)}s)${why ? " — " + why.slice(0, 160) : ""}`);
    done();
  });
});
if (args.includes("--list")) { console.log(JSON.stringify(jobs.map((j) => j[0]))); process.exit(0); }
const queue = jobs.filter((j) => !only || j[0] === only || (only.endsWith("*") && j[0].startsWith(only.slice(0, -1))));
await Promise.all(Array.from({ length: width }, async () => { for (let j = queue.shift(); j; j = queue.shift()) await run(j); }));
const failed = rows.filter((r) => !r.ok);
fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify({ level, secs: Math.round((Date.now() - t0) / 1000), rows }, null, 1));
console.log(`\n${failed.length ? `${failed.length} of ${rows.length} failed` : `all ${rows.length} passed`} at level ${level} in ${Math.round((Date.now() - t0) / 1000)}s, ${width} at a time — detail in ${path.relative(root, dir)}/`);
process.exit(failed.length ? 1 : 0);
