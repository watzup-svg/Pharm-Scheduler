// Node-only pressure tests (no browser). Usage: node scripts/pressure/node.mjs <fuzz|hostile|big> <level>
// Prints one line (ok/FAIL and the numbers); detail goes to stdout lines starting with "  " which the runner stores in the log.
import fs from "node:fs";
import path from "node:path";
import { bigDoc, imp, rng, root } from "./lib.mjs";

const [job, level = "low"] = process.argv.slice(2);
const L = { low: 0, medium: 1, high: 2 }[level];
const pick = (a) => a[L];
const fail = [];
const note = (m) => { if (fail.length < 12) fail.push(m); };
const { parseDoc, serializeDoc } = await imp("src/lib/schedule/file.ts");
const { evaluate } = await imp("src/lib/schedule/rules.ts");
const t0 = Date.now();

if (job === "fuzz") {
  // Damage the saved-file fixtures thousands of ways. Rule: a file is loaded and then behaves, or rejected cleanly. Never an uncaught crash.
  const N = pick([2000, 10000, 50000]);
  const rnd = rng(11);
  const texts = ["saved-v1.json", "saved-v2.json"].map((f) => fs.readFileSync(path.join(root, "src/lib/schedule/fixtures", f), "utf8"));
  const junk = [null, undefined, "", "x".repeat(2000), -1, 1e308, NaN, [], {}, true, "2026-02-30", { a: 1 }, "🧪", "<script>"];
  const walk = (o, f) => { if (o && typeof o === "object") { const ks = Object.keys(o); if (ks.length) { const k = ks[Math.floor(rnd() * ks.length)]; if (rnd() < 0.35) f(o, k); else walk(o[k], f); } } };
  let loaded = 0, rejected = 0;
  for (let i = 0; i < N; i++) {
    let text = texts[i % texts.length];
    const how = Math.floor(rnd() * 6);
    try {
      if (how === 0) text = text.slice(0, Math.floor(rnd() * text.length));
      else if (how === 1) { const b = Math.floor(rnd() * text.length); text = text.slice(0, b) + String.fromCharCode(32 + Math.floor(rnd() * 90)) + text.slice(b + 1); }
      else { const o = JSON.parse(text); const edits = 1 + Math.floor(rnd() * 3); for (let e = 0; e < edits; e++) walk(o, (p, k) => { if (how === 2) p[k] = junk[Math.floor(rnd() * junk.length)]; else if (how === 3) delete p[k]; else if (how === 4) p[k] = Array.isArray(p[k]) ? {} : [p[k]]; else p[k] = { ...(typeof p[k] === "object" && p[k] ? p[k] : {}), extra: junk[Math.floor(rnd() * junk.length)] }; }); text = JSON.stringify(o); }
    } catch { /* damaged text is the input */ }
    let doc;
    try { doc = parseDoc(text); } catch (e) { if (!(e instanceof Error)) note(`non-Error thrown #${i}`); rejected++; continue; }
    loaded++;
    try {
      evaluate(doc);
      const once = parseDoc(serializeDoc(doc));
      if (serializeDoc(parseDoc(serializeDoc(once))) !== serializeDoc(once)) note(`not stable after save and open, case ${i} (mode ${how})`);
    } catch (e) { note(`loaded file then crashed: ${e.message} (case ${i}, mode ${how})`); }
  }
  console.log(`  ${N} damaged files: ${loaded} loaded, ${rejected} rejected`);
}

if (job === "hostile") {
  // Odd data in, no crash out: names, empty months, odd dates. Every view the print sheet and PDF use must still build.
  const { createDemo } = await imp("src/lib/schedule/demo.ts");
  const { districtModel } = await imp("src/lib/schedule/district.ts");
  const { fixSteps } = await imp("src/lib/schedule/fix.ts");
  const { buildDistrictSheet } = await imp("src/lib/schedule/print-model.ts");
  const { buildPdfBytes } = await imp("src/lib/schedule/pdf.ts");
  const { placeName } = await imp("src/lib/schedule/place.ts");
  const rnd = rng(5);
  // The People form caps names at 80 characters and trims them, so these are what a person can really type.
  const names = ["x".repeat(80), "🧪🧪🧪", "مرحبا بالعالم", "<b>x</b>", "'; drop table", "Anders Kowal-Rasmussen", "A", "line\nbreak", "\u0000", "Zoë Ångström", "  inner  spaces  "];
  const months = [[2028, 2], [2100, 2], [2026, 12], [2027, 1], [2026, 2], [2029, 3], [2026, 11]];
  const N = pick([30, 100, 300]);
  const check = (label, doc) => {
    try {
      const ev = evaluate(doc);
      districtModel(doc, ev, null);
      fixSteps(doc, ev, "rph");
      const sheet = buildDistrictSheet(doc, ev);
      const pdf = buildPdfBytes(sheet);
      if (new Uint8Array(pdf.slice(0, 4)).join() !== "37,80,68,70") note(`${label}: not a PDF`);
      const once = parseDoc(serializeDoc(doc));
      if (serializeDoc(parseDoc(serializeDoc(once))) !== serializeDoc(once)) note(`${label}: not stable after save and open`);
    } catch (e) { note(`${label}: ${String(e.message).slice(0, 100)}`); }
  };
  for (let i = 0; i < N; i++) {
    const base = createDemo();
    const [y, m] = months[i % months.length];
    let doc = { ...base, year: y, month: m };
    const mode = i % 5;
    if (mode === 0) doc = { ...doc, people: doc.people.map((p, k) => ({ ...p, name: names[(i + k) % names.length] || `P${k}` })), grid: {} };
    if (mode === 1) doc = { ...doc, stores: [], grid: {}, timeOff: [] };
    if (mode === 2) doc = { ...doc, people: doc.people.slice(0, 1), grid: {}, timeOff: [] };
    if (mode === 3) doc = { ...doc, people: [], grid: {}, timeOff: [], holidays: [] };
    if (mode === 4 && doc.stores.length && doc.people.length) for (let k = 0; k < 40; k++) doc = placeName(doc, doc.stores[Math.floor(rnd() * doc.stores.length)].code, "pharmacist", 1 + Math.floor(rnd() * 31), doc.people[Math.floor(rnd() * doc.people.length)].name).doc;
    check(`case ${i} (${y}-${m}, mode ${mode})`, doc);
  }
  console.log(`  ${N} odd months and name sets`);
}

if (job === "big") {
  // Engine and PDF at the largest size, against speed limits, then a long edit run watching memory.
  const { districtModel } = await imp("src/lib/schedule/district.ts");
  const { buildDistrictSheet } = await imp("src/lib/schedule/print-model.ts");
  const { buildPdfBytes } = await imp("src/lib/schedule/pdf.ts");
  const { placeName } = await imp("src/lib/schedule/place.ts");
  const { todayParts } = await imp("src/lib/schedule/calendar.ts");
  const [N, P] = pick([[40, 150], [40, 150], [120, 500]]);
  const edits = pick([20000, 40000, 100000]);
  const doc = await bigDoc(N, P);
  const ms = (fn, n = 3) => { fn(); const t = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t) / n; };
  const ev = evaluate(doc);
  // Limits are generous (a slow CI runner is about 2x slower than the numbers measured on the dev machine).
  const lim = N >= 120 ? { evaluate: 150, district: 500, save: 50, open: 200 } : { evaluate: 60, district: 200, save: 20, open: 80 };
  const got = { evaluate: ms(() => evaluate(doc)), district: ms(() => districtModel(doc, ev, todayParts())), save: ms(() => serializeDoc(doc)), open: ms(() => parseDoc(serializeDoc(doc))) };
  for (const k of Object.keys(lim)) if (got[k] > lim[k]) note(`${k} ${got[k].toFixed(0)} ms is over the ${lim[k]} ms limit at ${N} stores`);
  const tp = performance.now();
  const pdf = buildPdfBytes(buildDistrictSheet(doc, ev));
  const pdfMs = performance.now() - tp;
  if (pdfMs > 10000) note(`PDF took ${pdfMs.toFixed(0)} ms (limit 10000)`);
  if (pdf.byteLength > 5e6) note(`PDF is ${(pdf.byteLength / 1e6).toFixed(1)} MB (limit 5)`);
  let d = doc; const people = doc.people.map((p) => p.name);
  global.gc?.(); const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < edits; i++) d = placeName(d, doc.stores[i % N].code, "pharmacist", 1 + (i % 28), people[i % P]).doc;
  global.gc?.(); const growth = (process.memoryUsage().heapUsed - h0) / 1e6;
  if (growth > 60) note(`heap grew ${growth.toFixed(0)} MB over ${edits} edits`);
  console.log(`  ${N} stores, ${P} people: ${Object.entries(got).map(([k, v]) => `${k} ${v.toFixed(0)}ms`).join(", ")}, pdf ${pdfMs.toFixed(0)}ms ${(pdf.byteLength / 1e6).toFixed(1)}MB, ${edits} edits grew heap ${growth.toFixed(1)}MB`);
}

console.log(`${fail.length ? "FAIL" : "ok  "} ${job} (${level}, ${((Date.now() - t0) / 1000).toFixed(0)}s)${fail.length ? " — " + fail[0] : ""}`);
for (const f of fail) console.log(`  ! ${f}`);
process.exit(fail.length ? 1 : 0);
