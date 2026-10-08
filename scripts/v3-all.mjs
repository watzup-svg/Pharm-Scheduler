// `npm run check:all`: everything that checks v3, in the right order, with one report and no model tokens.
//   npm run check:all                     safe checks in parallel, then the timing-sensitive ones one at a time (about 10 min)
//   npm run check:all -- --quick          skip the random-click stress and the pressure test (about 5 min)
//   npm run check:all -- --level medium   pressure level (low default; high is long)
//   npm run check:all -- --no-prototype   skip the old prototype's tests
// Phase 1 runs side by side because none of it measures speed: types and unit tests (`check:v3`), the old prototype's tests, the
// dependency audit (skipped when offline), the print PDF check (pure Node, no browser) and a scan that the built file asks the network for nothing.
// Phase 2 runs one at a time on an otherwise quiet machine because it has time budgets: the browser suites, the same suites in
// Firefox and WebKit when installed, random-click stress, and the pressure test.
// Output: a one-screen summary, test-logs/check-all-<stamp>/REPORT.md (+ report.json), full logs per step. Exit 1 on any failure.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const quick = flag("--quick");
const level = opt("--level", "low");
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const dir = path.join(root, "test-logs", `check-all-${stamp}`);
fs.mkdirSync(dir, { recursive: true });

const results = [];
const slug = (s) => s.toLowerCase().replace(/\W+/g, "-").replace(/^-|-$/g, "");

function run(name, cmd, cmdArgs, { env = {}, timeoutMs = 20 * 60_000, skipIf, offlineOk = false } = {}) {
  return new Promise((done) => {
    const t0 = Date.now();
    const finish = (r) => {
      const secs = Math.round((Date.now() - t0) / 1000);
      const file = path.join(dir, `${slug(name)}.log`);
      fs.writeFileSync(file, r.out ?? "");
      const row = { name, status: r.status, secs, log: path.relative(root, file), detail: r.detail ?? "", out: r.out ?? "" };
      results.push(row);
      console.log(`${row.status === "ok" ? "ok  " : row.status === "skip" ? "skip" : "FAIL"} ${name} (${secs}s)${row.detail ? "  " + row.detail : ""}`);
      done(row);
    };
    const why = skipIf?.();
    if (why) return finish({ status: "skip", detail: why });
    let out = "";
    const child = spawn(cmd, cmdArgs, { cwd: root, env: { ...process.env, ...env } });
    const timer = setTimeout(() => { out += `\n[killed after ${Math.round(timeoutMs / 1000)}s]`; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      // A check that needs the network is skipped (not failed) when there is none.
      if (code !== 0 && offlineOk && /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|getaddrinfo|audit endpoint|network|403 Forbidden/i.test(out)) return finish({ status: "skip", detail: "no network", out });
      finish({ status: code === 0 ? "ok" : "fail", out });
    });
    child.on("error", (e) => { clearTimeout(timer); finish({ status: "fail", out: String(e) }); });
  });
}

// ---- the built file asks the network for nothing it should not ----
function offlineScan() {
  const html = path.join(root, "dist-v3", "v3.html");
  if (!fs.existsSync(html)) return { status: "fail", out: "dist-v3/v3.html is missing", detail: "no build" };
  const text = fs.readFileSync(html, "utf8");
  // Namespace identifiers, error-message links and license comments are not requests. jsPDF's "pdfobjectnewwindow" output mode names a CDN, but
  // app3/print/pdf.ts only uses the arraybuffer output, so it never runs.
  const allowed = [/^https?:\/\/www\.w3\.org\//, /^http:\/\/jspdf\.default\.namespaceuri\//, /^https:\/\/react\.dev\/errors/, /^https:\/\/tailwindcss\.com/, /^https:\/\/github\.com\//, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfobject\//];
  const urls = [...new Set(text.match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? [])];
  const bad = urls.filter((u) => !allowed.some((a) => a.test(u)));
  const tags = (text.match(/<(script|link|img|iframe)\b[^>]*\b(src|href)=["']https?:/gi) ?? []).length;
  const out = `${urls.length} distinct URLs in the file, ${bad.length} not on the allow-list, ${tags} external src/href tags\n${bad.join("\n")}`;
  return { status: bad.length || tags ? "fail" : "ok", out, detail: bad.length || tags ? `${bad.length + tags} external reference(s)` : "" };
}

function browserInstalled(name) {
  const r = spawnSync("node", ["-e", `const pw=require("playwright-core");const p=pw.${name}.executablePath();process.exit(require("fs").existsSync(p)?0:1)`], { cwd: root });
  return r.status === 0;
}

const t0 = Date.now();
console.log(`check:all  level=${level}${quick ? "  quick" : ""}\nlogs: ${path.relative(root, dir)}/\n`);

// Build first: the browser steps and the scan need the file.
const build = await run("build v3", "npm", ["run", "build:v3"]);

// ---- phase 1: side by side ----
console.log("\n-- phase 1: correctness, in parallel --");
await Promise.all([
  run("types + unit tests (check:v3)", "npm", ["run", "check:v3"]),
  run("print PDF check", "node", ["scripts/v3-pdf-check.mjs"]),
  run("size budget + licences", "node", ["scripts/v3-size-budget.mjs"]),
  run("reproducible build", "node", ["scripts/v3-repro-build.mjs"]),
  run("old prototype tests", "npm", ["run", "check"], { skipIf: () => (flag("--no-prototype") ? "--no-prototype" : null) }),
  run("dependency audit", "npm", ["audit", "--omit=dev", "--audit-level=high"], { offlineOk: true }),
  (async () => { const r = offlineScan(); const file = path.join(dir, "offline-scan.log"); fs.writeFileSync(file, r.out); results.push({ name: "built file makes no network requests", status: r.status, secs: 0, log: path.relative(root, file), detail: r.detail, out: r.out }); console.log(`${r.status === "ok" ? "ok  " : "FAIL"} built file makes no network requests  ${r.detail}`); })(),
]);

// ---- phase 2: one at a time ----
console.log("\n-- phase 2: browser and timing checks, one at a time --");
if (build.status === "ok") {
  await run("browser suites (Chromium)", "node", ["scripts/v3-e2e.mjs"], { timeoutMs: 15 * 60_000 });
  for (const b of ["firefox", "webkit"]) {
    await run(`browser suites (${b})`, "node", ["scripts/v3-e2e.mjs"], { env: { BROWSER: b }, timeoutMs: 20 * 60_000, skipIf: () => (browserInstalled(b) ? null : `${b} is not installed for Playwright`) });
  }
  await run("perf baseline", "node", ["scripts/v3-perf-baseline.mjs"], { timeoutMs: 10 * 60_000 });
  if (!quick) {
    await run("random-click stress", "node", ["stress/v3-monkey-parallel.mjs"], { env: { SEEDS: level === "low" ? "6" : "12", ACTIONS: "150" }, timeoutMs: 30 * 60_000 });
    await run(`pressure test (${level})`, "npm", ["run", "pressure:v3", "--", "--level", level], { timeoutMs: 60 * 60_000 });
  } else {
    results.push({ name: "random-click stress", status: "skip", secs: 0, log: "", detail: "--quick", out: "" });
    results.push({ name: `pressure test (${level})`, status: "skip", secs: 0, log: "", detail: "--quick", out: "" });
  }
} else {
  console.log("skipped: the build failed");
}

// ---- report ----
const bad = results.filter((r) => r.status === "fail");
const secs = Math.round((Date.now() - t0) / 1000);
const git = (a) => spawnSync("git", a, { cwd: root, encoding: "utf8" }).stdout.trim();
const lines = [
  `# check:all report: ${bad.length ? `FAIL (${bad.length} failing)` : "PASS"}`,
  `- Commit: \`${git(["rev-parse", "--short", "HEAD"])}\` on \`${git(["branch", "--show-current"])}\`${git(["status", "--porcelain"]) ? " (uncommitted changes present)" : ""}`,
  `- Level: ${level}${quick ? ", quick" : ""} | Duration: ${secs}s | Node ${process.version} | ${new Date().toISOString()}`,
  "", "| Step | Result | Time | Log |", "|---|---|---|---|",
  ...results.map((r) => `| ${r.name} | ${r.status === "ok" ? "ok" : r.status === "skip" ? `skipped${r.detail ? ` (${r.detail})` : ""}` : "FAIL"} | ${r.secs}s | ${r.log ? "`" + r.log + "`" : ""} |`),
];
for (const r of bad) {
  const ls = r.out.trim().split("\n");
  const key = ls.filter((l) => /^FAIL|^not ok|FAIL |Error|error TS|vulnerab|REPORT:/.test(l)).slice(0, 12);
  lines.push("", `## ${r.name}`, "```", ...(key.length ? key : ls.slice(-15)).map((l) => l.slice(0, 300)), "```", `Full log: \`${r.log}\``);
  if (/pressure/.test(r.name)) lines.push("Pressure detail: `test-logs/pressure-v3-latest/REPORT.md` (replay commands inside).");
}
lines.push("", "## Paste to Claude", bad.length ? `check:all failed in: ${bad.map((r) => r.name).join("; ")}. Read ${path.relative(root, path.join(dir, "REPORT.md"))} and the logs it names, then find the cause before changing anything.` : "Everything passed; nothing to debug.");
fs.writeFileSync(path.join(dir, "REPORT.md"), lines.join("\n") + "\n");
fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify({ at: new Date().toISOString(), level, quick, secs, results: results.map(({ out, ...r }) => r) }, null, 2));
try { fs.rmSync(path.join(root, "test-logs", "check-all-latest"), { force: true }); fs.symlinkSync(dir, path.join(root, "test-logs", "check-all-latest")); } catch { /* best effort */ }
console.log(`\n${bad.length ? `${bad.length} of ${results.length} steps failed` : `all passed in ${secs}s`}\nREPORT: ${path.relative(root, path.join(dir, "REPORT.md"))}`);
process.exit(bad.length ? 1 : 0);
