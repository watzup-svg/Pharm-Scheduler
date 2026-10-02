// Speed and memory probes. Engine timings on small, normal and very large months (node), then every page loaded with the large month
// in the browser (load time, DOM size, heap) at laptop and phone width. Usage: node scripts/audit/perf.mjs <out.json> [--no-browser]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const { createDemo } = await imp("src/lib/schedule/demo.ts");
const { evaluate } = await imp("src/lib/schedule/rules.ts");
const { placeName } = await imp("src/lib/schedule/place.ts");
const { parseDoc, serializeDoc } = await imp("src/lib/schedule/file.ts");
const { districtModel } = await imp("src/lib/schedule/district.ts");
const { fixSteps } = await imp("src/lib/schedule/fix.ts");
const { buildDistrictSheet } = await imp("src/lib/schedule/print-model.ts");
const { todayParts } = await imp("src/lib/schedule/calendar.ts");

let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
function big(N, P) {
  const base = createDemo();
  const stores = Array.from({ length: N }, (_, i) => ({ ...base.stores[i % base.stores.length], code: `S${String(i).padStart(2, "0")}`, name: `Store ${i}` }));
  const people = Array.from({ length: P }, (_, i) => ({ ...base.people[i % base.people.length], name: `Pharmacist Number${i}`, home: stores[i % N].code }));
  let doc = { ...base, stores, people, grid: {}, timeOff: [], holidays: [] };
  for (let i = 0; i < N * 20; i++) { const r = placeName(doc, stores[Math.floor(rnd() * N)].code, "pharmacist", 1 + Math.floor(rnd() * 31), people[Math.floor(rnd() * P)].name); doc = r.doc; }
  return doc;
}
const ms = (fn, n = 1) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(); return +((performance.now() - t) / n).toFixed(2); };
const engine = [];
for (const [label, doc] of [["normal (18 stores, 22 people)", createDemo()], ["large (40 stores, 150 people)", big(40, 150)], ["huge (120 stores, 500 people)", big(120, 500)]]) {
  const ev = evaluate(doc);
  engine.push({ label, evaluate_ms: ms(() => evaluate(doc), 3), fixSteps_ms: ms(() => fixSteps(doc, ev, "rph"), 3), districtModel_ms: ms(() => districtModel(doc, ev, todayParts()), 3), serialize_ms: ms(() => serializeDoc(doc), 3), parse_ms: ms(() => parseDoc(serializeDoc(doc)), 2), printSheet_ms: ms(() => buildDistrictSheet(doc), 2), fileKB: Math.round(serializeDoc(doc).length / 1024) });
}
// memory over many edits on the normal month
let d = createDemo(); const names = d.people.map((p) => p.name); const h0 = process.memoryUsage().heapUsed;
for (let i = 0; i < 20000; i++) d = placeName(d, d.stores[i % d.stores.length].code, "pharmacist", 1 + (i % 28), names[i % names.length]).doc;
global.gc?.(); const heapGrowthMB = +((process.memoryUsage().heapUsed - h0) / 1e6).toFixed(1);
const out = { engine, edits20000_heapGrowthMB: heapGrowthMB, pages: [] };

if (!process.argv.includes("--no-browser")) {
  const { serve } = await imp("scripts/serve.mjs");
  const { launch } = await imp("e2e/lib.mjs");
  const s = await serve();
  const bigDoc = big(40, 150);
  const payload = JSON.stringify({ doc: JSON.parse(serializeDoc(bigDoc)), fileName: "big.hisp.json", dirty: false });
  const browser = await launch();
  for (const size of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) for (const route of ["", "schedule", "time-off", "people", "stores", "holidays", "lists", "print"]) {
    const ctx = await browser.newContext({ viewport: size });
    await ctx.addInitScript((r) => { localStorage.setItem("hischool-trial-demo-v1", "1"); localStorage.setItem("hischool-schedule-welcomed", "1"); localStorage.setItem("hischool-schedule-autosave-v3", r); window.print = () => {}; }, payload);
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await ctx.newCDPSession(page); await cdp.send("Performance.enable");
    const t0 = Date.now(); await page.goto(`${s.base}#/${route}`, { waitUntil: "load" }); await page.waitForTimeout(1200);
    const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
    const dom = await page.evaluate(() => document.getElementsByTagName("*").length);
    out.pages.push({ page: `${route || "district"} @${size.width}`, loadMs: Date.now() - t0 - 1200, scriptMs: Math.round((m.ScriptDuration ?? 0) * 1000), layoutMs: Math.round((m.LayoutDuration ?? 0) * 1000), domNodes: dom, heapMB: +((m.JSHeapUsedSize ?? 0) / 1e6).toFixed(1), errors: errors.length });
    await ctx.close();
  }
  await browser.close(); s.close();
}
fs.writeFileSync(process.argv[2] ?? "perf.json", JSON.stringify(out, null, 1));
console.log(`perf: ${engine.length} engine sizes, ${out.pages.length} pages`);
