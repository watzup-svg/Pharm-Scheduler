import { launch, open, axeSource, BASE } from "./lib.mjs";
import fs from "node:fs";
const b = await launch();
const routes = ["", "schedule", "time-off", "holidays", "print", "people", "stores"];
const widths = [320, 360, 390, 768, 1024, 1366, 1920];
let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(ok ? "ok  " : "FAIL", m); };
// A overflow + errors
for (const r of routes) for (const w of widths) {
  const { page, errors } = await open(b, r, { width: w, height: 800 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const offscreen = await page.evaluate(() => [...document.querySelectorAll("header button, header a")].filter(e => { const r = e.getBoundingClientRect(); return r.width>0 && (r.right > innerWidth+1); }).length);
  if (over > 1 || offscreen || errors.length) say(false, `overflow /${r} @${w}: over=${over} offscreen=${offscreen} errors=${errors.join(";")}`);
  await page.close();
}
console.log("A overflow sweep done");
// B axe
const axe = axeSource();
for (const r of routes) for (const w of [390, 1366]) {
  const { page } = await open(b, r, { width: w, height: 900 });
  await page.evaluate(axe);
  const res = await page.evaluate(() => axe.run(document, { resultTypes: ["violations"] }));
  const v = res.violations.filter(x => x.impact === "serious" || x.impact === "critical");
  say(v.length === 0, `axe /${r} @${w} ${v.map(x => x.id + "×" + x.nodes.length).join(",")}`);
  await page.close();
}
// C keyboard: tab 60 times on schedule; ensure focus moves and never stuck
{
  const { page } = await open(b, "schedule", { width: 1366, height: 900 });
  const seen = new Set(); let stuck = 0, last = "";
  for (let i = 0; i < 80; i++) { await page.keyboard.press("Tab"); const d = await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + "|" + (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 30) + "|" + (() => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; })() : "none"; }); if (d === last) stuck++; last = d; seen.add(d); }
  say(seen.size > 30 && stuck < 3, `keyboard: ${seen.size} distinct stops, stuck ${stuck}`);
  // dialog focus: open Fill via keyboard, Esc returns focus to opener
  await page.goto(`${BASE}#/schedule`); await page.waitForTimeout(500);
  const fill = page.getByRole("region", { name: "Month status" }).getByRole("button", { name: /^Fill/ });
  await fill.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  const inDialog = await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  const back = await page.evaluate(() => /^Fill/.test(document.activeElement?.textContent || ""));
  say(inDialog && back, `dialog focus in=${inDialog} returned=${back}`);
  await page.close();
}
// D perf
{
  const t0 = Date.now();
  const { page } = await open(b, "schedule", { width: 1366, height: 900 });
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
  console.log("D perf load ms:", nav, "wall:", Date.now() - t0);
  const t1 = Date.now();
  await page.getByRole("region", { name: "Month status" }).getByRole("button", { name: /^Fill/ }).click();
  await page.getByRole("dialog").waitFor();
  console.log("D Fill dialog open ms:", Date.now() - t1);
  say(nav.load < 3000, "load under 3s");
  await page.close();
}
// E persistence
{
  const { page } = await open(b, "schedule", { width: 1366, height: 900 });
  await page.getByRole("region", { name: "Month status" }).getByRole("button", { name: /^Fill/ }).click();
  await page.getByRole("button", { name: /^Schedule \d+ p/ }).click(); await page.waitForTimeout(800);
  const before = await page.locator("header").first().innerText();
  await page.reload(); await page.waitForTimeout(1200);
  const after = await page.locator("header").first().innerText();
  console.log("E before:", before.split("\n").slice(0,3).join(" | "), "\nE after reload:", after.split("\n").slice(0,3).join(" | "));
  await page.close();
}
console.log(bad ? `${bad} FAILURES` : "ALL OK");
await b.close();
