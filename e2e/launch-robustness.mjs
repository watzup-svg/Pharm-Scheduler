import { launch } from "./lib.mjs";
import fs from "node:fs";
const b = await launch();
const keys = ["hischool-schedule","hischool-schedule-autosave-v3","hischool-schedule-autofile","hischool-schedule-archive-v1","hischool-schedule-backups-v1","hischool-schedule-printed-v1","hischool-display-v1","hischool-last-visit-v1","hischool-checklist-v1","hischool-checklist-seen-v1"];
const junk = ["", "{", "null", "[]", "{\"a\":1}", "\u0000", "x".repeat(5000), "{\"doc\":{\"format\":\"hischool-schedule\",\"version\":2}}", "{\"ym\":[1,2,3]}"];
let bad = 0;
for (const j of junk) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } });
  await ctx.addInitScript(([keys, j]) => { try { for (const k of keys) localStorage.setItem(k, j); } catch {} }, [keys, j]);
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
  for (const r of ["", "schedule", "time-off", "print", "people"]) { await page.goto(`http://127.0.0.1:3002/spa.html#/${r}`); await page.waitForTimeout(500); }
  const body = await page.locator("body").innerText();
  const ok = errs.length === 0 && body.length > 200 && !/Something went wrong|Application error/i.test(body);
  if (!ok) { bad++; console.log("FAIL junk", JSON.stringify(j.slice(0, 20)), errs.slice(0, 2), body.slice(0, 120).replace(/\n/g, " ")); }
  await ctx.close();
}
console.log("junk storage cases failed:", bad);
// clock variants
for (const when of ["2026-12-31T23:30:00", "2028-02-29T12:00:00", "2027-01-01T00:05:00", "2026-10-31T09:00:00", "2100-03-31T09:00:00"]) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage(); const errs = [];
  await page.clock.install({ time: new Date(when) });
  page.on("pageerror", e => errs.push(e.message));
  for (const r of ["", "schedule", "time-off", "holidays", "print"]) { await page.goto(`http://127.0.0.1:3002/spa.html#/${r}`); await page.waitForTimeout(400); }
  const t = (await page.locator("main").first().innerText()).split("\n").find(l => /Today is|today/i.test(l)) ?? "";
  console.log(errs.length ? "FAIL" : "ok  ", "clock", when, errs.slice(0,2), t.slice(0, 60));
  await ctx.close();
}
// import corrupt and big file via File menu
{
  const page = await b.newPage({ viewport: { width: 1366, height: 900 } }); const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.goto("http://127.0.0.1:3002/spa.html#/"); await page.waitForTimeout(600);
  const before = await page.locator("header").first().innerText();
  fs.writeFileSync("/tmp/bad.json", "{ not json");
  await page.getByRole("button", { name: "File" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null), page.getByRole("menuitem", { name: /Open/ }).first().click()]);
  if (chooser) { await chooser.setFiles("/tmp/bad.json"); await page.waitForTimeout(700); console.log("bad file toasts:", await page.locator("[data-sonner-toast]").allInnerTexts()); }
  else console.log("no filechooser (uses picker API)");
  const after = await page.locator("header").first().innerText();
  console.log(before === after ? "ok   doc unchanged after bad file" : "FAIL doc changed", errs);
  await page.close();
}
await b.close();
