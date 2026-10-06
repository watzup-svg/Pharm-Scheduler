// Size budget and licence check for the single-file build.
//   node scripts/v3-size-budget.mjs          (build first: npm run build:v3)
// 1. dist-v3/v3.html must be at most `maxBytes` from scripts/v3-size-budget.json (the size when the budget was set + 15%).
//    Over budget: prints what the bytes are made of (inlined WASM, fonts, images, scripts, styles, known libraries by marker string).
// 2. Every production dependency (package.json "dependencies" and what they depend on) must carry an allowed licence
//    (MIT, ISC, BSD-*, Apache-2.0, 0BSD, CC0-1.0, Unlicense, Zlib). Anything else, or no licence field, fails unless the budget JSON
//    lists it under "licenseExceptions" with the reason it was reviewed.
// To raise the budget on purpose: edit maxBytes in the JSON in the same commit that explains why.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cfg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "v3-size-budget.json"), "utf8"));
let failures = 0;
const ok = (m) => console.log(`ok   ${m}`);
const fail = (m) => { failures++; console.log(`FAIL ${m}`); };
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// ---------- size ----------
const file = path.join(root, cfg.file);
if (!fs.existsSync(file)) { console.log(`FAIL ${cfg.file} is missing. Build first: npm run build:v3`); process.exit(1); }
const html = fs.readFileSync(file, "utf8");
const bytes = Buffer.byteLength(html);
if (bytes <= cfg.maxBytes) ok(`${cfg.file} is ${bytes} bytes (${kb(bytes)}), budget ${cfg.maxBytes} (${kb(cfg.maxBytes)}), headroom ${(((cfg.maxBytes - bytes) / cfg.maxBytes) * 100).toFixed(1)}%`);
else {
  fail(`${cfg.file} is ${bytes} bytes (${kb(bytes)}), over the budget of ${cfg.maxBytes} (${kb(cfg.maxBytes)}) by ${kb(bytes - cfg.maxBytes)}`);
  console.log("     What the bytes are:");
  const parts = new Map();
  const add = (k, n) => parts.set(k, (parts.get(k) ?? 0) + n);
  let rest = html;
  rest = rest.replace(/data:([\w/+.-]+);base64,[A-Za-z0-9+/=]+/g, (m, mime) => { add(`data URI ${mime}`, m.length); return ""; });
  rest = rest.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g, (m, body) => { add("script (JS)", body.length); return ""; });
  rest = rest.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/g, (m, body) => { add("style (CSS)", body.length); return ""; });
  add("markup and other", rest.length);
  for (const [k, n] of [...parts].sort((a, b) => b[1] - a[1])) console.log(`       ${kb(n).padStart(11)}  ${k}`);
  // The bundle is one minified script, so libraries are found by a string only they contain (counts hint at weight, not exact size).
  const markers = { "jsPDF": "jsPDF", "pako / zlib": "pako", "sql.js": "sqlite3", "React DOM": "react.transitional.element", "TanStack Router": "tanstack", "Radix": "radix", "zod": "ZodError", "lucide icons": "lucide", "sonner": "sonner", "fflate": "fflate" };
  console.log("     Known libraries (occurrences of a marker string; more is heavier):");
  for (const [name, m] of Object.entries(markers)) console.log(`       ${String(html.split(m).length - 1).padStart(6)}  ${name}`);
  const big = [...html.matchAll(/[A-Za-z0-9+/=]{200000,}/g)].map((m) => m[0].length);
  if (big.length) console.log(`     Large base64 blocks: ${big.map((n) => kb(n)).join(", ")}`);
}

// ---------- licences ----------
const ALLOWED = [/^MIT$/i, /^ISC$/i, /^BSD(-[\w.]+)*$/i, /^Apache-2\.0$/i, /^0BSD$/i, /^CC0(-1\.0)?$/i, /^Unlicense$/i, /^Zlib$/i];
const allowedId = (id) => ALLOWED.some((r) => r.test(id.trim()));
/** SPDX expression: AND needs every part allowed, OR any one. Parentheses nest. */
function allowedExpr(expr) {
  const toks = expr.replace(/\(/g, " ( ").replace(/\)/g, " ) ").split(/\s+/).filter(Boolean);
  let i = 0;
  const parseOr = () => { let v = parseAnd(); while (toks[i]?.toUpperCase() === "OR") { i++; const r = parseAnd(); v = v || r; } return v; };
  const parseAnd = () => { let v = parseAtom(); while (toks[i]?.toUpperCase() === "AND") { i++; const r = parseAtom(); v = v && r; } return v; };
  const parseAtom = () => { const t = toks[i++]; if (t === "(") { const v = parseOr(); i++; return v; } return t === undefined ? false : allowedId(t.replace(/\+$/, "")); };
  return parseOr();
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const seen = new Map();
function find(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const f = path.join(dir, "node_modules", name, "package.json");
    if (fs.existsSync(f)) return f;
    if (dir === path.dirname(dir) || dir === path.dirname(root)) return null;
  }
}
function visit(name, from, via) {
  const f = find(name, from);
  if (!f) { if (!seen.has(name)) seen.set(name, { missing: true, via }); return; }
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const key = `${j.name}@${j.version}`;
  if (seen.has(key)) return;
  const lic = typeof j.license === "string" ? j.license : j.license?.type ?? (Array.isArray(j.licenses) ? j.licenses.map((l) => l.type ?? l).join(" OR ") : undefined);
  seen.set(key, { name: j.name, lic, via });
  for (const d of Object.keys(j.dependencies ?? {})) visit(d, path.dirname(f), via ?? name);
  for (const d of Object.keys(j.peerDependencies ?? {})) if (!j.peerDependenciesMeta?.[d]?.optional) visit(d, path.dirname(f), via ?? name);
}
for (const d of Object.keys(pkg.dependencies ?? {})) visit(d, root, null);
const exceptions = cfg.licenseExceptions ?? {};
let n = 0, reviewed = 0;
for (const [key, v] of seen) {
  n++;
  if (v.missing) { fail(`licence: ${key} (needed by ${v.via}) is not installed, cannot check it`); continue; }
  if (!v.lic) { if (exceptions[v.name]) { reviewed++; continue; } fail(`licence: ${key} declares no licence`); continue; }
  if (allowedExpr(v.lic)) continue;
  if (exceptions[v.name]) { reviewed++; console.log(`note licence exception: ${key} is ${v.lic}. ${exceptions[v.name]}`); continue; }
  fail(`licence: ${key} is "${v.lic}", not on the allow-list (needed by ${v.via ?? "package.json"})`);
}
for (const name of Object.keys(exceptions)) if (![...seen.values()].some((v) => v.name === name)) fail(`licenseExceptions lists ${name}, which is not a production dependency any more: remove it`);
if (!failures) ok(`${n} production packages checked, all licences allowed (${reviewed} reviewed exception${reviewed === 1 ? "" : "s"})`);
process.exit(failures ? 1 : 0);
