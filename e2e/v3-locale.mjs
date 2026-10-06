// Time zone and language independence. The same practice month is opened in 16 browser contexts (time zones Pacific/Auckland, Pacific/Honolulu,
// America/Los_Angeles, UTC x locales en-US, de-DE, ar-EG, ja-JP) with the clock frozen at one instant that is the same calendar day (6 Oct 2026)
// in all four zones. Everything a person reads as a date must be identical: wall headers, the schedule text, Time off, Print (after posting)
// and the PDF bytes; so must the schedule itself (domain state hash, open cells). No label may contain NaN, Invalid Date or undefined.
// Build first: npm run build:v3.   node e2e/v3-locale.mjs
import { launch, serveV3, check, failed } from "./v3-lib.mjs";
import { evaluate, stateHash } from "../domain/src/index.ts";

const ZONES = ["Pacific/Auckland", "Pacific/Honolulu", "America/Los_Angeles", "UTC"];
const LOCALES = ["en-US", "de-DE", "ar-EG", "ja-JP"];
const NOW = "2026-10-06T10:30:00Z"; // 23:30 in Auckland (NZDT), 00:30 in Honolulu, 03:30 in Los Angeles: 6 Oct everywhere
const BAD = /NaN|Invalid Date|undefined|\[object/;

const b = await launch();
const s = await serveV3();
const runs = [];
for (const timezoneId of ZONES) {
  for (const locale of LOCALES) {
    const ctx = await b.newContext({ timezoneId, locale, viewport: { width: 1366, height: 800 }, acceptDownloads: true });
    await ctx.clock.setFixedTime(NOW);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(s.base, { waitUntil: "load" });
    await page.waitForFunction(() => window.__v3);
    await page.evaluate(() => window.__v3.loadPractice());
    await page.evaluate(() => { const a = window.__v3.app.getState(); a.setWindow("2026-10-01", "2026-10-31"); a.setAsOf("2026-10-06"); a.setView("wall"); });
    await page.waitForSelector('[role="gridcell"]');
    const tzSeen = await page.evaluate(() => ({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, loc: navigator.language, today: (() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; })() }));
    const grab = async (view) => {
      await page.evaluate((v) => window.__v3.app.getState().setView(v), view);
      await page.waitForTimeout(150);
      return page.locator("main").innerText();
    };
    const wallHead = await page.$$eval('[role="grid"] [role="columnheader"]', (a) => a.map((x) => `${x.getAttribute("aria-label") ?? ""}|${x.textContent}`).join("\n"));
    const wall = await grab("wall");
    const timeoff = await grab("timeoff");
    const print0 = await grab("print");
    await page.click("[data-post]");
    await page.waitForSelector("[data-revision='1']");
    const print1 = await page.locator("main").innerText();
    const model = await page.evaluate(() => JSON.stringify(window.__v3print.modelFor(1)));
    const pdf = await page.evaluate(() => window.__v3print.pdfHash(1));
    const state = await page.evaluate(() => JSON.stringify(window.__v3.app.getState().world.state));
    // Posting (a change set in the journal) must not touch the schedule; hash the state before the post would be the same.
    const st = JSON.parse(state);
    const ev = evaluate(st, "2026-10-06");
    const open = Object.values(ev.cells).reduce((n, c) => n + (c.open ?? 0), 0);
    runs.push({ id: `${timezoneId} ${locale}`, tzSeen, errors, wallHead, wall, timeoff, print0, print1, model, pdf, hash: stateHash(st), open, cells: Object.keys(ev.cells).length });
    await ctx.close();
  }
}
const ref = runs[0];
console.log(`     reference ${ref.id}: hash ${ref.hash}, ${ref.cells} cells, ${ref.open} open, pdf ${ref.pdf}`);
check("every context really ran in its time zone and language", runs.every((r, i) => r.tzSeen.tz === ZONES[Math.floor(i / 4)] && r.tzSeen.loc.startsWith(LOCALES[i % 4].slice(0, 2))), runs.map((r) => `${r.tzSeen.tz}/${r.tzSeen.loc}`).join(" "));
check("the frozen clock is 6 Oct 2026 in every zone", runs.every((r) => r.tzSeen.today === "2026-10-6"), runs.map((r) => r.tzSeen.today).join(" "));
const same = (key) => runs.filter((r) => r[key] !== ref[key]).map((r) => r.id);
for (const [key, label] of [["hash", "schedule state hash"], ["open", "open cell count"], ["cells", "cell count"], ["wallHead", "wall header labels (dates, month, today)"], ["wall", "Schedule screen text"], ["timeoff", "Time off screen text (ranges)"], ["print0", "Print screen before posting"], ["print1", "Print screen after posting (period, revision, dates)"], ["model", "print model"], ["pdf", "PDF bytes (hash)"]]) {
  const diff = same(key);
  check(`identical in all 16 contexts: ${label}`, diff.length === 0, `differs in ${diff.slice(0, 5).join(", ")}`);
}
for (const key of ["wallHead", "wall", "timeoff", "print0", "print1"]) {
  const bad = runs.filter((r) => BAD.test(r[key])).map((r) => `${r.id}: ${(BAD.exec(r[key]) ?? [""])[0]}`);
  check(`no NaN / Invalid Date / undefined in ${key}`, bad.length === 0, bad.slice(0, 3).join("; "));
}
check("the screens have real date text (not empty)", /October 2026/.test(ref.wallHead) && /Oct/.test(ref.timeoff + ref.print1) && ref.wall.length > 200, ref.wallHead.slice(0, 80));
check("no console errors in any context", runs.every((r) => r.errors.length === 0), runs.flatMap((r) => r.errors.map((e) => `${r.id}: ${e}`)).slice(0, 3).join(" | "));
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
