// Runs every e2e/v3-*.mjs check (except the library); non-zero if any fails.
// The files do not share state (each opens its own server and browser page), so most run a few at a time. The ones that depend on timing, pixels or
// the disk run one after another afterwards, alone on the machine. E2E_JOBS=1 runs everything in order; an argument filters by file name.
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "e2e");
const only = process.argv[2];
const files = readdirSync(dir).filter((f) => /^v3-.+\.mjs$/.test(f) && f !== "v3-lib.mjs" && (!only || f.includes(only))).sort();
const SERIAL = new Set(["v3-races.mjs", "v3-resilience.mjs", "v3-scale-keyboard.mjs", "v3-month-in-the-life.mjs", "v3-visual.mjs", "v3-layout.mjs", "v3-windows.mjs", "v3-persist.mjs", "v3-print-browser.mjs"]);
const jobs = Math.max(1, Number(process.env.E2E_JOBS ?? Math.min(3, cpus().length - 1)));

let bad = 0;
function run(f) {
  return new Promise((done) => {
    const t = Date.now();
    const p = spawn("node", [path.join(dir, f)], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const kill = setTimeout(() => p.kill("SIGKILL"), 600000);
    p.on("close", (code) => {
      clearTimeout(kill);
      const fails = (out.match(/^FAIL/gm) ?? []).length;
      const oks = (out.match(/^ok/gm) ?? []).length;
      console.log(`${code === 0 && !fails ? "ok  " : "FAIL"} ${f}  ${oks} ok, ${fails} failed, ${((Date.now() - t) / 1000).toFixed(0)}s`);
      if (code !== 0 || fails) { bad++; console.log(out.split("\n").filter((l) => l.startsWith("FAIL")).join("\n"), err.slice(-400)); }
      done();
    });
  });
}

const parallel = jobs > 1 ? files.filter((f) => !SERIAL.has(f)) : [];
const serial = jobs > 1 ? files.filter((f) => SERIAL.has(f)) : files;
// The longest file first, so the pool does not end waiting on one straggler.
const LONG = ["v3-a11y.mjs", "v3-locale.mjs", "v3-hostile-text.mjs", "v3-chrome.mjs"];
parallel.sort((a, b) => (LONG.includes(b) ? 1 : 0) - (LONG.includes(a) ? 1 : 0));
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, parallel.length) }, async () => { while (next < parallel.length) await run(parallel[next++]); }));
for (const f of serial) await run(f);
process.exit(bad ? 1 : 0);
