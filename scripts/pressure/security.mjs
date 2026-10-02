// Security and stability tests that need no browser. Usage: node scripts/pressure/security.mjs <scan|files|zones> <level>
//   scan   risky code patterns in src and the built page, and anything that looks like a key or password in tracked files
//   files  hostile saved files: huge, deeply nested, prototype-pollution keys, odd text encodings. Must reject or load, quickly, and pollute nothing
//   zones  the whole unit test suite under six time zones (dates must not shift)
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { imp, root } from "./lib.mjs";

const [job, level = "low"] = process.argv.slice(2);
const L = { low: 0, medium: 1, high: 2 }[level];
const fail = [];
const note = (m) => { if (fail.length < 12) fail.push(m); };
const t0 = Date.now();
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const walk = (d, out = []) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };

if (job === "scan") {
  const src = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.ts$|routeTree\.gen/.test(f));
  const risky = [
    [/dangerouslySetInnerHTML/, "dangerouslySetInnerHTML"],
    [/\.(innerHTML|outerHTML)\s*=/, "innerHTML/outerHTML assignment"],
    [/\beval\s*\(/, "eval"],
    [/new Function\s*\(/, "new Function"],
    [/document\.write\s*\(/, "document.write"],
    [/insertAdjacentHTML/, "insertAdjacentHTML"],
    [/\bpostMessage\s*\(/, "postMessage"],
    [/localStorage\.setItem\([^)]*(password|token|secret|apikey)/i, "secret-looking value in storage"],
    // www.irs.gov is the one deliberate outside link: a plain link the manager clicks (Stores > mileage rate source); nothing is fetched.
    [/https?:\/\/(?!www\.w3\.org|www\.irs\.gov|localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/i, "web address in source"],
  ];
  const allowed = [/\/\/.*https?:/, /\*.*https?:/]; // addresses in comments are fine
  for (const f of src) {
    const lines = read(f).split("\n");
    lines.forEach((line, i) => {
      if (allowed.some((a) => a.test(line))) return;
      for (const [re, what] of risky) if (re.test(line)) note(`${f}:${i + 1} ${what}`);
      if (/target=["']_blank["']/.test(line) && !/noopener/.test(lines.slice(Math.max(0, i - 3), i + 4).join(" "))) note(`${f}:${i + 1} target=_blank without noopener`);
    });
  }
  // Anything key-shaped in any tracked file.
  const files = execSync("git ls-files -z", { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter((f) => f && !/\.(png|jpg|ico|woff2?|lock)$|package-lock/.test(f));
  const secret = [/AKIA[0-9A-Z]{16}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /sk-[A-Za-z0-9]{32,}/, /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/, /xox[baprs]-[A-Za-z0-9-]{10,}/, /(password|passwd|secret|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i];
  for (const f of files) {
    let t; try { t = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
    if (t.length > 3e6) continue;
    for (const re of secret) if (re.test(t)) note(`${f}: looks like a key or password (${re.source.slice(0, 24)}…)`);
  }
  // The built page: no outside script or stylesheet, no network calls to anything but itself.
  for (const f of ["dist-spa/spa.html", "dist-real/spa.html"]) {
    if (!fs.existsSync(path.join(root, f))) continue;
    const html = read(f);
    if (/<script[^>]+src=["']https?:/i.test(html)) note(`${f}: loads a script from outside`);
    if (/<link[^>]+href=["']https?:[^>]*stylesheet/i.test(html)) note(`${f}: loads a stylesheet from outside`);
    if (/sourceMappingURL=/.test(html)) note(`${f}: ships a source map pointer`);
  }
  console.log(`  ${src.length} source files and ${files.length} tracked files scanned`);
}

if (job === "files") {
  const { parseDoc } = await imp("src/lib/schedule/file.ts");
  const before = Object.getOwnPropertyNames(Object.prototype).sort().join();
  const demo = read("src/lib/schedule/fixtures/saved-v2.json");
  const cases = [];
  const MB = [10, 40, 120][L];
  cases.push([`${MB} MB of padding`, () => JSON.stringify({ ...JSON.parse(demo), junk: "x".repeat(MB * 1e6) })]);
  cases.push(["nested 100000 deep", () => "[".repeat(100000) + "]".repeat(100000)]);
  cases.push(["nested objects 50000 deep", () => '{"a":'.repeat(50000) + "1" + "}".repeat(50000)]);
  cases.push(["a million people", () => { const d = JSON.parse(demo); d.people = Array.from({ length: [200000, 500000, 1000000][L] }, (_, i) => ({ ...d.people[0], name: `P${i}` })); return JSON.stringify(d); }]);
  cases.push(["__proto__ keys", () => demo.replace(/^\{/, '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},')]);
  cases.push(["__proto__ inside a person", () => { const d = JSON.parse(demo); const p = JSON.stringify(d.people[0]).replace(/^\{/, '{"__proto__":{"polluted":1},'); return demo.replace(JSON.stringify(d.people[0]), p); }]);
  cases.push(["byte order mark", () => "﻿" + demo]);
  cases.push(["NUL bytes", () => demo.replace("{", "{\u0000")]);
  cases.push(["UTF-16 text", () => Buffer.from(demo, "utf16le").toString("latin1")]);
  cases.push(["empty", () => ""]);
  cases.push(["just null", () => "null"]);
  cases.push(["a number", () => "42"]);
  cases.push(["HTML page saved by mistake", () => "<!doctype html><html><body>hi</body></html>"]);
  for (const [name, make] of cases) {
    let text;
    try { text = make(); } catch (e) { note(`${name}: could not build the case: ${e.message}`); continue; }
    const t = Date.now();
    let outcome = "loaded";
    try { parseDoc(text); } catch (e) { outcome = e instanceof Error ? "rejected" : "threw a non-Error"; if (!(e instanceof Error)) note(`${name}: threw a non-Error`); if (e instanceof RangeError) note(`${name}: stack overflow was not handled (${e.message})`); }
    const ms = Date.now() - t;
    if (ms > 8000) note(`${name}: took ${ms} ms`);
    if (({}).polluted !== undefined) note(`${name}: polluted Object.prototype`);
    console.log(`  ${name}: ${outcome} in ${ms} ms`);
  }
  if (Object.getOwnPropertyNames(Object.prototype).sort().join() !== before) note("Object.prototype changed");
}

if (job === "zones") {
  // The unit tests use dates heavily. Run them all in zones where "today" is a different calendar day, and in two with half-hour offsets.
  const zones = ["UTC", "America/Los_Angeles", "Pacific/Auckland", "Pacific/Kiritimati", "Asia/Kolkata", "America/St_Johns"];
  const files = [...walk("src/lib").filter((f) => f.endsWith(".test.ts")), ...walk("src/store").filter((f) => f.endsWith(".test.ts"))];
  const zs = L === 0 ? zones.slice(0, 3) : zones;
  let n = 0;
  const run = (tz) => new Promise((done) => {
    let out = "";
    const c = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "--test", ...files], { cwd: root, env: { ...process.env, TZ: tz } });
    c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
    c.on("close", (code) => { n++; const pass = /# pass (\d+)/.exec(out)?.[1]; if (code !== 0) note(`${tz}: unit tests failed — ${(out.split("\n").find((l) => /^not ok|^\s+not ok/.test(l)) ?? "").trim().slice(0, 100)}`); console.log(`  ${tz}: ${code === 0 ? "passed " + pass : "FAILED"}`); done(); });
  });
  const q = [...zs];
  await Promise.all(Array.from({ length: 2 }, async () => { for (let z = q.shift(); z; z = q.shift()) await run(z); }));
}

console.log(`${fail.length ? "FAIL" : "ok  "} ${job} (${level}, ${((Date.now() - t0) / 1000).toFixed(0)}s)${fail.length ? " — " + fail[0] : ""}`);
for (const f of fail) console.log(`  ! ${f}`);
process.exit(fail.length ? 1 : 0);
