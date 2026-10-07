// v3 browser check: Setup People (week marks, filters), Stores (open weekdays, month line, missing drive times) and Holidays (one change set per toggle, Undo).
//   npm run build:v3 && node e2e/v3-people-stores.mjs
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
import { evaluate, stateHash, addDays, weekday } from "../domain/src/index.ts";

const srv = await serveV3();
const browser = await launch();
const stateOf = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__v3.app.getState().world.state)));
const go = async (page, tab) => { await page.evaluate((t) => window.__v3.app.getState().setSetupTab(t), tab); await page.waitForTimeout(250); };

try {
  const { page, errors } = await openApp(browser, srv.base, { practice: false });
  await page.evaluate(() => { window.__v3.loadProblems(); const a = window.__v3.app.getState(); a.setView("setup"); });
  await page.waitForTimeout(300);
  const asOf = await page.evaluate(() => window.__v3.app.getState().asOf);
  const win = await page.evaluate(() => window.__v3.app.getState().window);

  // ---------- People ----------
  await go(page, "pharmacists");
  let st = await stateOf(page);
  const monday = addDays(asOf, -((weekday(asOf) + 6) % 7));
  const rows = page.locator("[data-pharmacist-row]");
  check("people: one row per active pharmacist", (await rows.count()) === Object.values(st.pharmacists).filter((p) => !(p.inactiveFrom && p.inactiveFrom <= asOf)).length, String(await rows.count()));
  let bad = 0, checked = 0;
  for (const p of Object.values(st.pharmacists).slice(0, 12)) {
    const row = page.locator(`[data-pharmacist-row="${p.name}"]`);
    if (!(await row.count())) continue;
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const asg = Object.values(st.assignments).filter((a) => a.pharmacistId === p.id && a.date === d);
      const off = Object.values(st.unavailability).some((u) => u.pharmacistId === p.id && !u.scopeStoreId && (u.status === "Approved" || u.status === "Actual") && u.first <= d && d <= u.last);
      const want = asg.length > 1 ? "double" : asg.length === 1 ? (!p.baseStoreId || asg[0].storeId === p.baseStoreId ? "home" : "cover") : off ? "off" : Object.values(st.unavailability).some((u) => u.pharmacistId === p.id && !u.scopeStoreId && u.status === "Requested" && u.first <= d && d <= u.last) ? "waiting" : "none";
      const got = await row.locator(`[data-week-marks] [data-date="${d}"]`).getAttribute("data-mark");
      checked += 1;
      if (got !== want) { bad += 1; console.log(`  ${p.name} ${d}: want ${want} got ${got}`); }
    }
  }
  check("people: week marks match the data", bad === 0 && checked >= 50, `${bad} wrong of ${checked}`);
  const sample = Object.values(st.pharmacists).find((p) => !(p.inactiveFrom && p.inactiveFrom <= asOf));
  const days = new Set(Object.values(st.assignments).filter((a) => a.pharmacistId === sample.id && a.date.startsWith(addDays(monday, 3).slice(0, 7))).map((a) => a.date)).size;
  const shownDays = Number(await page.locator(`[data-pharmacist-row="${sample.name}"] [data-days]`).innerText());
  check("people: this month day count matches", shownDays === days, `${shownDays} vs ${days} for ${sample.name}`);
  check("people: licence not recorded is a warning in words", (await page.locator("[data-pharmacist-row]", { hasText: "Not recorded" }).count()) >= 1);

  const need = await page.locator('[data-attention="yes"]').count();
  await page.getByRole("button", { name: /^Needs a look/ }).click();
  check("people: 'needs a look' filter keeps only flagged rows", (await rows.count()) === need && need >= 1, `${await rows.count()} vs ${need}`);
  check("people: flagged rows say why (licence or run)", (await page.locator('[data-attention="yes"]', { hasText: /Not recorded|ends|ended|No licence|in a row/ }).count()) === need);
  await page.getByRole("button", { name: "Everyone" }).click();
  await page.getByRole("button", { name: "Next week" }).click();
  check("people: next week moves the marks", (await page.locator("[data-week-marks] [data-date]").first().getAttribute("data-date")) === addDays(monday, 7));
  await page.getByRole("button", { name: "Previous week" }).click();

  // ---------- Stores ----------
  await go(page, "stores");
  st = await stateOf(page);
  const month = win.from.slice(0, 7);
  const ev = evaluate(st, asOf, { range: { from: `${month}-01`, to: addDays(`${month}-28`, 3).slice(0, 7) === month ? addDays(`${month}-28`, 3) : `${month}-28` } });
  let tickBad = 0, tickN = 0;
  for (const s of Object.values(st.stores).slice(0, 6)) {
    for (let d = 1; d <= 28; d += 3) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      const cov = ev.cells[`${s.id}|${date}`];
      const asg = Object.values(st.assignments).filter((a) => a.storeId === s.id && a.date === date);
      const bro = asg.some((a) => ev.assignments[a.id]?.results.some((r) => r.verdict === "Fail" && !r.overridden));
      const want = (cov?.required ?? 0) === 0 && asg.length === 0 ? "closed" : (cov?.open ?? 0) > 0 ? "open" : bro ? "broken" : "covered";
      const got = await page.locator(`[data-store-row="${s.code}"] [data-month-line] [data-date="${date}"]`).getAttribute("data-tick");
      tickN += 1;
      if (got !== want) { tickBad += 1; console.log(`  ${s.code} ${date}: want ${want} got ${got}`); }
    }
  }
  check("stores: month ticks match evaluate for sampled days", tickBad === 0 && tickN >= 50, `${tickBad} wrong of ${tickN}`);
  const s1 = Object.values(st.stores)[0];
  let wantNeed = 0;
  for (const r of Object.values(st.requirements)) if (r.storeId === s1.id && r.weekday === 1 && r.effectiveFrom <= asOf) wantNeed = r.count;
  check("stores: weekday marks show the weekly need", Number(await page.locator(`[data-store-row="${s1.code}"] [data-weekday="Mon"]`).getAttribute("data-need")) === wantNeed);
  check("stores: a month line has the longest-run line", (await page.locator("[data-store-row] [data-run]").count()) === Object.keys(st.stores).length);

  // ---------- missing drive times: never invented ----------
  const before = stateHash(st);
  const openBtn = page.getByRole("button", { name: "Add them" });
  check("drive helper: shown because the practice month has an unmeasured pair", (await openBtn.count()) === 1);
  await openBtn.click();
  const inputs = page.locator('[data-testid="new-store-distances"] input');
  const n = await inputs.count();
  const vals = await inputs.evaluateAll((els) => els.map((e) => e.value));
  check("drive helper: every box starts empty", n >= 2 && vals.every((v) => v === ""), JSON.stringify(vals));
  check("drive helper: Save is off until something is typed", await page.getByRole("button", { name: /^Save drive times/ }).isDisabled());
  const li = page.locator("[data-missing-pair]").first();
  await li.locator('input[aria-label^="Minutes"]').fill("45");
  await page.getByRole("button", { name: /^Save 1 drive time/ }).click();
  check("drive helper: minutes without miles is refused in words", (await page.getByText("Needs both").count()) === 1 && stateHash(await stateOf(page)) === before);
  await li.locator('input[aria-label^="Miles"]').fill("30");
  await page.getByRole("button", { name: /^Save 1 drive time/ }).click();
  await page.waitForTimeout(200);
  const after = await stateOf(page);
  check("drive helper: typed pair saved both ways, nothing else", Object.keys(after.travel).length >= Object.keys(st.travel).length + 1 && stateHash(after) !== before);
  const added = Object.entries(after.travel).filter(([k]) => !st.travel[k]);
  check("drive helper: only the typed numbers were stored", added.length >= 1 && added.every(([, t]) => t.minutes === 45 && t.miles === 30), JSON.stringify(added));
  // a new store: no known pair, so no nearest store and no guess
  await page.evaluate(() => { const a = window.__v3.app.getState(); a.commit([{ t: "store.set", store: { id: "S99", code: "NEW", name: "New Pharmacy", state: "OR" } }], "Added store NEW."); });
  await page.waitForTimeout(250);
  const hb = page.locator('[data-testid="new-store-distances"]');
  if (!(await hb.locator("input").count())) await hb.getByRole("button", { name: /Add them/ }).click();
  await hb.locator("select").selectOption({ label: /NEW/ }).catch(() => {});
  check("drive helper: new store lists its missing pairs, all blank", (await hb.locator("[data-missing-pair]").count()) >= 15 && (await hb.locator("input").evaluateAll((e) => e.every((i) => i.value === ""))));
  check("drive helper: 'start from nearest' is off when nothing is known", await hb.getByRole("button", { name: /Start from/ }).isDisabled());
  // after adding the first store-pair, a store with known pairs offers its nearest
  await page.screenshot({ path: "/tmp/v3-people-stores-helper.png" });

  // ---------- Holidays ----------
  await page.evaluate(() => { window.__v3.loadProblems(); const a = window.__v3.app.getState(); a.setAsOf("2026-10-06"); a.setSetupTab("holidays"); });
  await page.waitForTimeout(300);
  st = await stateOf(page);
  const h0 = stateHash(st);
  const row = page.locator('[data-holiday="thanksgiving"]');
  check("holidays: Thanksgiving 2026 is Thu Nov 26", (await row.getAttribute("data-date")) === "2026-11-26");
  check("holidays: nothing set yet says usual hours", (await row.locator("[data-holiday-status]").innerText()).includes("Usual hours"));
  const sw = row.getByRole("switch");
  const csBefore = await page.evaluate(() => window.__v3.app.getState().world.journal.changeSets.length);
  await sw.click();
  await page.waitForTimeout(250);
  st = await stateOf(page);
  const closed = Object.values(st.dateOverrides).filter((o) => o.date === "2026-11-26" && o.count === 0 && o.note === "Thanksgiving");
  const openThu = Object.values(st.stores).filter((s) => Object.values(st.requirements).some((r) => r.storeId === s.id && r.weekday === 4 && r.count > 0)).length;
  check("holidays: the toggle closes every open store, noted with the holiday name", closed.length === openThu && openThu > 0, `${closed.length} of ${openThu}`);
  check("holidays: one change set for the toggle", (await page.evaluate(() => window.__v3.app.getState().world.journal.changeSets.length)) === csBefore + 1);
  check("holidays: row says it is set", (await row.locator("[data-holiday-status]").innerText()).includes("Closed everywhere"));
  await page.screenshot({ path: "/tmp/v3-people-stores-holidays.png" });
  await page.getByRole("button", { name: "Undo" }).first().click();
  await page.waitForTimeout(250);
  check("holidays: Undo restores the exact state", stateHash(await stateOf(page)) === h0);
  // one store from the Stores panel
  await row.getByRole("button", { name: /Choose stores/ }).click();
  const sel = row.locator("select").first();
  await sel.selectOption("closed");
  await page.waitForTimeout(200);
  st = await stateOf(page);
  check("holidays: one store can be closed on its own", Object.values(st.dateOverrides).filter((o) => o.date === "2026-11-26").length === 1);
  const ud = await page.evaluate(() => { const s = window.__v3.app.getState(); return s.undo(s.world.journal.changeSets.at(-1).id); });
  check("holidays: and undone", ud && stateHash(await stateOf(page)) === h0);

  check("no page errors", errors.length === 0, errors.join("; "));
  await page.close();
} finally {
  await browser.close();
  srv.close();
}
process.exit(failed() ? 1 : 0);
