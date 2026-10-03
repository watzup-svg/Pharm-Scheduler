// `npm run e2e` builds nothing: run `npm run build:trial` first. The runner serves dist-spa itself (see e2e/README.md).
import { fileURLToPath } from "node:url";
import { failed } from "./lib.mjs";
import smoke from "./smoke.mjs";
import timeoff from "./timeoff.mjs";
import print from "./print.mjs";
import pages from "./pages.mjs";
import dialogs from "./dialogs.mjs";
import fit from "./fit.mjs";
import cover from "./cover.mjs";
import swapClick from "./swap-click.mjs";
import phase1 from "./phase1.mjs";
import marks from "./marks.mjs";
import hoverRules from "./hover-rules.mjs";
import navigator from "./navigator.mjs";
import headerLinks from "./header-links.mjs";
import nextMonth from "./next-month.mjs";
import miniMonth from "./mini-month.mjs";
import storeNumbers from "./store-numbers.mjs";
import newStoreDistances from "./new-store-distances.mjs";
import problemCardMarks from "./problem-card-marks.mjs";
import rightClickNotes from "./right-click-notes.mjs";
import phone from "./phone.mjs";

const GROUPS = [["smoke", smoke], ["time off", timeoff], ["print", print], ["pages", pages], ["dialogs", dialogs], ["fit", fit], ["cover plans", cover], ["click swap", swapClick], ["daily jobs", phase1], ["marks", marks], ["hover rules", hoverRules], ["issue navigator", navigator], ["header links", headerLinks], ["next month", nextMonth], ["small month", miniMonth], ["store numbers", storeNumbers], ["new store distances", newStoreDistances], ["problem card marks", problemCardMarks], ["right click notes", rightClickNotes], ["phone touch", phone]];

// Each group opens its own browser (a fresh profile) against the same static page, so groups never share state and can run side by side.
//   npm run e2e                 every group, a few at a time, with a short summary (failures print in full)
//   npm run e2e -- <name> ...   only the groups whose name contains one of these words
//   npm run e2e -- --serial     one group after another in this process, every line printed (the old way)
//   npm run e2e -- --shard 1/2  every other group, so CI can split the suite across machines
const args = process.argv.slice(2);
const serial = args.includes("--serial") || process.env.E2E_CHILD === "1";
const shard = args.includes("--shard") ? args[args.indexOf("--shard") + 1].split("/").map(Number) : null;
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--shard").map((a) => a.toLowerCase().replace(/[-_]/g, " "));
const picked = GROUPS.filter(([name], i) => (!only.length || only.some((o) => (process.env.E2E_CHILD === "1" ? name === o : name.includes(o)))) && (!shard || i % shard[1] === shard[0] - 1));

if (serial) {
  for (const [name, fn] of picked) {
    console.log(`\n# ${name}`);
    await fn();
  }
  console.log(failed() ? `\n${failed()} check(s) failed` : "\nall checks passed");
  process.exit(failed() ? 1 : 0);
}

const { spawn } = await import("node:child_process");
const fs = await import("node:fs");
const path = await import("node:path");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Serve the built page ourselves on a free port, so a run needs no setup and two runs at once never share a port.
const { serve } = await import("../scripts/serve.mjs");
let server = null;
if (!process.env.BASE) {
  try { server = await serve(); } catch (e) { console.log(e.message); process.exit(2); }
  process.env.BASE = server.base;
}
// Every group's full output goes to a log file; the screen gets the summary and any failure in full.
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const logDir = path.join(root, "test-logs");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, `e2e-${stamp}-${process.pid}.log`);
fs.writeFileSync(logFile, "");
process.env.E2E_TMP ||= fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "hischool-e2e-"));
const os = await import("node:os");
const width = Math.max(1, Math.min(Number(process.env.E2E_JOBS) || os.cpus().length - 1, picked.length));
const started = Date.now();
const results = [];
const run = (name) =>
  new Promise((done) => {
    const t0 = Date.now();
    let out = "";
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), name], { env: { ...process.env, E2E_CHILD: "1" } });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const lines = out.split("\n");
      const checks = lines.filter((l) => /^(ok  |FAIL)/.test(l)).length;
      fs.appendFileSync(logFile, `\n# ${name}\n${out}`);
      results.push({ name, code, secs: Math.round((Date.now() - t0) / 1000), checks, out });
      console.log(`${code === 0 ? "ok  " : "FAIL"} ${name} (${checks} checks, ${Math.round((Date.now() - t0) / 1000)}s)`);
      done();
    });
  });
const queue = picked.map(([name]) => name);
await Promise.all(Array.from({ length: width }, async () => { for (let n = queue.shift(); n; n = queue.shift()) await run(n); }));
const bad = results.filter((r) => r.code !== 0);
for (const r of bad) console.log(`\n# ${r.name} (failed)\n${r.out.trim()}`);
const total = results.reduce((n, r) => n + r.checks, 0);
console.log(bad.length ? `\n${bad.length} of ${results.length} group(s) failed` : `\nall ${total} checks passed in ${results.length} groups, ${Math.round((Date.now() - started) / 1000)}s on ${width} at a time`);
console.log(`full output: ${path.relative(root, logFile)}`);
server?.close();
process.exit(bad.length ? 1 : 0);
