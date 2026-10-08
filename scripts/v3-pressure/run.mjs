// `npm run pressure:v3 -- --level low|medium|high [--only <suite[,suite]>] [--list] [--jobs N] [--no-compare]`
// Token-free, seeded pressure test for the v3 scheduler. Runs each suite as a child process (own timeout, own log), then writes
//   test-logs/pressure-v3-<stamp>-<level>/REPORT.md     what an AI (or a person) reads first: ~1-3 KB when green, replay-ready detail when not
//   test-logs/pressure-v3-<stamp>-<level>/report.json   the same, machine readable (also the baseline for the next run's regression diff)
//   test-logs/pressure-v3-<stamp>-<level>/<suite>.log   full output per suite
// Levels (same tests, more seeds and bigger scale): low about 2 min, medium about 10 min, high about 30 min. Exit code is non-zero on any failure.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : null);
const level = val("level") ?? "low";
if (!["low", "medium", "high"].includes(level)) { console.log("level must be low, medium or high"); process.exit(2); }
const L = { low: 0, medium: 1, high: 2 }[level];
const scale = [1, 5, 15][L];

const STRIP = ["--experimental-strip-types", "--no-warnings"];
// soft = the suite stops starting new cases after this many seconds (reported as "not started"); the hard timeout kills it.
const SUITES = [
  { name: "browser", file: "suites/browser.mjs", soft: [170, 700, 2000][L], what: "monkey, 120-store UI, fault injection, memory soak (Chromium)" },
  { name: "search-soak", file: "suites/search-soak.ts", soft: [80, 380, 1100][L], what: "Build / Repair / Improve over generated months" },
  { name: "domain-fuzz", file: "suites/domain-fuzz.ts", soft: [60, 300, 1400][L], what: "random edits, undo/redo, checkpoints on 18/60/120 stores" },
  { name: "hostile-files", file: "suites/hostile-files.ts", soft: [60, 260, 900][L], what: "damaged save files must be refused or load clean" },
  { name: "persistence-torture", file: "suites/persistence-torture.ts", soft: [50, 220, 1200][L], what: "failed writes, full storage, kills, stale copies" },
  { name: "determinism", file: "suites/determinism.ts", soft: [45, 200, 600][L], what: "same input => same hashes, in process and in a fresh one" },
];
if (flag("list")) { for (const s of SUITES) console.log(`${s.name.padEnd(20)} ${s.what}`); process.exit(0); }
const only = val("only") ? val("only").split(",") : null;
const picked = SUITES.filter((s) => !only || only.some((o) => o === s.name || (o.endsWith("*") && s.name.startsWith(o.slice(0, -1)))));
if (!picked.length) { console.log(`no suite matches --only ${val("only")}. Suites: ${SUITES.map((s) => s.name).join(", ")}`); process.exit(2); }

const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const logsRoot = path.join(root, "test-logs");
const dir = path.join(logsRoot, `pressure-v3-${stamp}-${level}`);
fs.mkdirSync(dir, { recursive: true });
const rel = (p) => path.relative(root, p);

const sh = (cmd, a) => { try { return spawnSync(cmd, a, { cwd: root, encoding: "utf8", timeout: 20000 }).stdout.trim(); } catch { return ""; } };
const commit = sh("git", ["rev-parse", "--short", "HEAD"]) || "unknown";
const dirty = sh("git", ["status", "--porcelain", "--", "app3", "domain", "persist", "scripts", "stress", "e2e"]) ? " + uncommitted changes" : "";
const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const chromium = fs.existsSync(CHROME) ? sh(CHROME, ["--version"]).replace(/\s+/g, " ") || "chromium (version unknown)" : "chromium NOT FOUND";

const jobs = Number(val("jobs") ?? Math.max(2, Math.min(3, os.cpus().length - 1)));
const t0 = Date.now();
const results = [];

function runSuite(s) {
  return new Promise((done) => {
    const t = Date.now();
    const logFile = path.join(dir, `${s.name}.log`);
    const log = fs.createWriteStream(logFile);
    const hard = (s.soft * 1.5 + 120) * 1000;
    const child = spawn(process.execPath, [...STRIP, path.join(root, "scripts/v3-pressure", s.file), "--level", level, "--out", dir, "--budget-sec", String(s.soft)], { cwd: root, env: { ...process.env, FORCE_COLOR: "0" } });
    let tail = "";
    let timedOut = false;
    const keep = (d) => { log.write(d); tail = (tail + d).slice(-4000); };
    child.stdout.on("data", keep); child.stderr.on("data", keep);
    const killer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, hard);
    child.on("close", (code) => {
      clearTimeout(killer); log.end();
      const rf = path.join(dir, `${s.name}.result.json`);
      let res = null;
      try { res = JSON.parse(fs.readFileSync(rf, "utf8")); } catch { /* crashed or killed */ }
      const secs = Math.round((Date.now() - t) / 1000);
      if (!res) {
        const cur = (() => { try { return fs.readFileSync(path.join(dir, `${s.name}.current`), "utf8").trim(); } catch { return ""; } })();
        const lines = tail.trim().split("\n").slice(-12).join("\n");
        res = {
          suite: s.name, level, ms: Date.now() - t, skippedForTime: 0, startedAt: new Date(t).toISOString(),
          cases: [{ case: "(whole suite)", ok: false, ms: Date.now() - t, failure: { invariant: timedOut ? "timeout" : "suite-crashed", message: timedOut ? `no result after ${Math.round(hard / 1000)} s (hard timeout); the suite hung or is far slower than its budget${cur ? `; last item in progress: ${cur}` : ""}` : `the suite process exited with code ${code} before writing a result`, replay: `node ${STRIP.join(" ")} scripts/v3-pressure/${s.file} --level ${level}`, stack: lines } }],
        };
      }
      res.soft = s.soft; res.wallMs = Date.now() - t;
      results.push(res);
      const bad = res.cases.filter((c) => !c.ok);
      const known = res.cases.filter((c) => c.known);
      console.log(`${bad.length ? "FAIL" : "ok  "} ${s.name} (${secs}s, ${res.cases.length} cases${bad.length ? `, ${bad.length} failed: ${bad.slice(0, 3).map((c) => c.case).join(", ")}${bad.length > 3 ? ", ..." : ""}` : ""}${known.length ? `, ${known.length} known` : ""})${res.skippedForTime ? ` [${res.skippedForTime} not started: time budget]` : ""}`);
      done();
    });
  });
}

console.log(`pressure:v3 level=${level} suites=${picked.map((s) => s.name).join(",")} jobs=${jobs}\nlogs: ${rel(dir)}/`);
const queue = picked.slice();
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { for (let s = queue.shift(); s; s = queue.shift()) await runSuite(s); }));
const durationMs = Date.now() - t0;
results.sort((a, b) => SUITES.findIndex((s) => s.name === a.suite) - SUITES.findIndex((s) => s.name === b.suite));

// ---------------- regression diff ----------------
let prev = null;
if (!flag("no-compare")) {
  try {
    const all = fs.readdirSync(logsRoot).filter((d) => /^pressure-v3-/.test(d) && d !== path.basename(dir) && fs.existsSync(path.join(logsRoot, d, "report.json"))).sort();
    for (const d of all.reverse()) { const j = JSON.parse(fs.readFileSync(path.join(logsRoot, d, "report.json"), "utf8")); if (j.level === level) { prev = { dir: d, json: j }; break; } }
  } catch { /* none */ }
}
const key = (r, c) => `${r.suite}/${c.case}`;
const cur = new Map(); for (const r of results) for (const c of r.cases) cur.set(key(r, c), c);
const diff = { against: prev?.dir ?? null, newlyFailing: [], slower: [], fixed: [], missing: 0 };
if (prev) {
  const old = new Map(); for (const r of prev.json.suites) for (const c of r.cases) old.set(key(r, c), c);
  for (const [k, c] of cur) {
    const o = old.get(k);
    if (!o) continue;
    if (o.ok && !c.ok) diff.newlyFailing.push(k);
    else if (!o.ok && c.ok) diff.fixed.push(k);
    else if (o.ok && c.ok && c.ms > o.ms * 1.25 && c.ms - o.ms > 300 && o.ms > 200) diff.slower.push({ case: k, was: o.ms, now: c.ms, pct: Math.round((c.ms / o.ms - 1) * 100) });
  }
  const ran = new Set(results.map((r) => r.suite));
  diff.missing = [...old.keys()].filter((k) => ran.has(k.split("/")[0]) && !cur.has(k)).length;
}

// ---------------- report ----------------
const fmt = (ms) => (ms >= 10000 ? `${(ms / 1000).toFixed(0)}s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
const allCases = results.flatMap((r) => r.cases.map((c) => ({ ...c, suite: r.suite })));
const failures = allCases.filter((c) => !c.ok);
const knowns = allCases.filter((c) => c.known);
const skipped = results.reduce((n, r) => n + r.skippedForTime, 0);
const lines = [];
const P = (s = "") => lines.push(s);
P(`# Pressure v3 report: ${failures.length ? `FAIL (${failures.length} failing case${failures.length === 1 ? "" : "s"})` : "PASS"}`);
P();
P(`- Commit: \`${commit}\`${dirty} on \`${branch}\``);
P(`- Level: **${level}** | Duration: ${fmt(durationMs)} | Node ${process.version} | ${chromium} | ${os.cpus().length} CPUs, ${os.platform()}`);
P(`- Started ${new Date(t0).toISOString()} | Suites: ${picked.map((s) => s.name).join(", ")}`);
if (skipped) P(`- ${skipped} case(s) were not started because a suite hit its time budget (they are not failures; see report.json).`);
P();
P("## Results");
P();
P("| Suite | Case | Result | ms | Budget |");
P("|---|---|---|---|---|");
for (const r of results) {
  const bad = r.cases.filter((c) => !c.ok || c.known);
  const good = r.cases.length - bad.length;
  if (good > 0) P(`| ${r.suite} | ${good} case${good === 1 ? "" : "s"} | ok | ${r.cases.filter((c) => c.ok && !c.known).reduce((n, c) => n + c.ms, 0)} | suite cap ${r.soft}s |`);
  for (const c of bad) P(`| ${r.suite} | ${c.case} | ${c.ok ? "KNOWN" : "FAIL"} | ${c.ms} | ${c.budgetMs ?? ""} |`);
}
P();
const slow = allCases.slice().sort((a, b) => b.ms - a.ms).slice(0, 10);
P("## Slowest 10");
P();
P("| Suite | Case | ms | Budget | Used |");
P("|---|---|---|---|---|");
for (const c of slow) P(`| ${c.suite} | ${c.case} | ${c.ms} | ${c.budgetMs ?? "-"} | ${c.budgetMs ? Math.round((c.ms / c.budgetMs) * 100) + "%" : "-"} |`);
P();

// key numbers per suite (whitelist, max for times / sums for counts)
const NUM = ["buildMs", "improveMs", "repairMs", "limitHit", "unresolved", "files", "journalAltered", "renderMs", "buildMs", "frameGapMs", "heapStartMB", "heapEndMB", "domStart", "domEnd", "commit", "kill", "cells"];
const nums = [];
for (const r of results) {
  const agg = {};
  for (const c of r.cases) for (const [k, v] of Object.entries(c.metrics ?? {})) if (typeof v === "number" && NUM.includes(k)) { const a = (agg[k] ??= { max: -Infinity, sum: 0 }); a.max = Math.max(a.max, v); a.sum += v; }
  const parts = NUM.filter((k, i) => agg[k] && NUM.indexOf(k) === i).map((k) => (/(Ms|MB|Start|End)$/.test(k) || k === "cells" ? `${k} max ${Math.round(agg[k].max)}` : `${k} total ${Math.round(agg[k].sum)}`));
  if (parts.length) nums.push(`- ${r.suite}: ${parts.join(", ")}`);
}
if (nums.length) { P("## Key numbers"); P(); for (const n of nums) P(n); P(); }
if (knowns.length) {
  P("## Known open issues observed (not failures)");
  P();
  for (const c of knowns) P(`- \`${c.suite}/${c.case}\`: ${c.known}`);
  P();
}
P("## Regression diff");
P();
if (!prev) P(flag("no-compare") ? "Skipped (--no-compare)." : `No earlier ${level} report.json under test-logs/ to compare with.`);
else {
  P(`Against \`${diff.against}\`: ${diff.newlyFailing.length} newly failing, ${diff.fixed.length} fixed, ${diff.slower.length} more than 25% slower${diff.missing ? `, ${diff.missing} cases not run this time` : ""}.`);
  if (diff.newlyFailing.length) { P(); P("Newly failing: " + diff.newlyFailing.map((k) => `\`${k}\``).join(", ")); }
  if (diff.fixed.length) { P(); P("Fixed: " + diff.fixed.map((k) => `\`${k}\``).join(", ")); }
  if (diff.slower.length) { P(); P("| Case | Was ms | Now ms | Change |"); P("|---|---|---|---|"); for (const s of diff.slower.slice(0, 15)) P(`| ${s.case} | ${s.was} | ${s.now} | +${s.pct}% |`); }
}
P();
if (failures.length) {
  P("## Failures");
  P();
  for (const c of failures) {
    const f = c.failure ?? { invariant: "unknown", message: "" };
    P(`### ${c.suite}/${c.case}`);
    P();
    P(`- **Invariant broken:** \`${f.invariant}\``);
    P(`- **What happened:** ${f.message.replace(/\n/g, " ")}`);
    if (f.replay) P(`- **Replay:** \`${f.replay}\``);
    if (f.stateHash) P(`- **State hash:** \`${f.stateHash}\``);
    if (f.screenshot) P(`- **Screenshot:** \`${f.screenshot}\``);
    P(`- **Log:** \`${rel(path.join(dir, c.suite + ".log"))}\``);
    if (f.lastActions?.length) { P(); P("Last actions:"); P("```"); for (const a of f.lastActions.slice(-20)) P(typeof a === "string" ? a : JSON.stringify(a)); P("```"); }
    if (f.stack) { P(); P("Stack:"); P("```"); P(f.stack); P("```"); }
    P();
  }
}
P("---");
P();
P("## Paste this to Claude");
P();
P("```");
P(failures.length
  ? `Pressure test pressure:v3 (level ${level}) found ${failures.length} failing case(s). Read ${rel(path.join(dir, "REPORT.md"))} (and report.json if you need every case). For each failure above: run its Replay command, find the root cause in the code under test (app3/, domain/src/, persist/), fix it, add a regression test next to the existing tests, then re-run \`npm run pressure:v3 -- --level ${level} --only <suite>\`. Do not loosen budgets or invariants without saying why. Anything under "Known open issues" is documented in docs/v3/HARDENING.md, leave it unless asked.`
  : `Pressure test pressure:v3 (level ${level}) passed. ${knowns.length ? `It observed ${knowns.length} known open issue(s) (see the report). ` : ""}If you changed search, persistence or the UI, also run \`npm run pressure:v3 -- --level medium\` before merging; details in ${rel(path.join(dir, "REPORT.md"))}.`);
P("```");
const md = lines.join("\n") + "\n";
fs.writeFileSync(path.join(dir, "REPORT.md"), md);
fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify({ level, commit, dirty: !!dirty, branch, node: process.version, chromium, startedAt: new Date(t0).toISOString(), durationMs, passed: failures.length === 0, failures: failures.map((c) => `${c.suite}/${c.case}`), regression: diff, suites: results }, null, 1));
try { const link = path.join(logsRoot, "pressure-v3-latest"); fs.rmSync(link, { force: true }); fs.symlinkSync(path.basename(dir), link); } catch { /* not important */ }

console.log(`\n${failures.length ? `${failures.length} case(s) FAILED` : "all passed"}${knowns.length ? `, ${knowns.length} known issue(s) observed` : ""} at level ${level} in ${fmt(durationMs)}`);
if (failures.length) for (const c of failures.slice(0, 8)) console.log(`  FAIL ${c.suite}/${c.case}: ${c.failure?.invariant}: ${(c.failure?.message ?? "").slice(0, 140)}`);
console.log(`REPORT: ${rel(path.join(dir, "REPORT.md"))}   (also test-logs/pressure-v3-latest/REPORT.md)`);
process.exit(failures.length ? 1 : 0);
