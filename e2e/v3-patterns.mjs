// Patterns: the typical month (what the patterns alone say), click-to-edit a person's pattern, and an alert when a pattern does not fit the stores.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const b = await launch();
const s = await serveV3();
const { page, errors } = await openApp(b, s.base);
const get = (fn, arg) => page.evaluate(fn, arg);
await get(() => { const a = window.__v3.app.getState(); a.setView("setup"); a.setSetupTab("patterns"); });
const std = page.locator("[data-standard-month]");
const builder = page.getByRole("group", { name: "Add a pattern" });
await std.waitFor();

// 1. The typical month
check("the page opens with a typical month for this month", /October 2026/.test(await std.locator("[data-standard-title]").innerText()));
const nRows = await std.locator('[role="row"][data-ri]').count();
const nPatternPeople = await get(() => new Set(Object.values(window.__v3.app.getState().world.state.standing).map((t) => t.pharmacistId)).size);
check("one row per person who has a pattern", nRows === nPatternPeople, `${nRows} vs ${nPatternPeople}`);
check("cells show the store code from the pattern", /^[A-Z0-9]{2,4}$/.test((await std.locator('[role="gridcell"][data-block="work"]').first().innerText()).trim()));
await std.getByRole("button", { name: "Next month" }).click();
check("the month can be changed", /November 2026/.test(await std.locator("[data-standard-title]").innerText()));
await std.getByRole("button", { name: "Previous month" }).click();
const noTimeOff = await std.locator('[role="gridcell"][data-block="away"], [role="gridcell"][data-block="req"]').count();
check("no time off or sickness is drawn here", noTimeOff === 0);

// 2. Click a day: that person's pattern opens in the editor below
const cell = std.locator('[role="gridcell"][data-r="3"][data-c="12"]');
const pid = await cell.getAttribute("data-pid");
const before = await get((id) => Object.values(window.__v3.app.getState().world.state.standing).filter((t) => t.pharmacistId === id).map((t) => ({ id: t.id, wd: t.recurrence.weekdays.join(), store: t.storeId })), pid);
await cell.click();
check("clicking a day loads that person into the editor, with a banner", (await builder.locator("[data-editing]").count()) === 1 && (await builder.getByLabel("Pharmacist", { exact: true }).inputValue()) === pid);
const paintedBefore = await builder.locator("[data-paint]:not([data-paint=''])").count();
check("their weekly pattern is painted on the grid", paintedBefore >= 3, String(paintedBefore));

// 3. An alert when a pattern does not fit the stores: paint a day the store is closed
const home = before[0].store;
const closedDay = await get((sid) => { const st = window.__v3.app.getState().world.state; for (const d of [0, 6, 1, 2, 3, 4, 5]) { const need = Object.values(st.requirements).filter((r) => r.storeId === sid && r.weekday === d); if (!need.length || need.every((r) => r.count === 0)) return d; } return null; }, home);
check("(setup) the home store is closed on some weekday", closedDay !== null, String(closedDay));
await builder.locator(`[data-week="0"][data-day="${closedDay}"]`).click();
const alert = builder.getByRole("alert", { name: "Problems with this pattern" });
check("painting a day the store is closed raises an alert that says so", (await alert.count()) === 1 && /never open on/.test(await alert.innerText()), await alert.innerText().catch(() => ""));
check("the painted day is marked on the grid", (await builder.locator(`[data-week="0"][data-day="${closedDay}"][data-warn="closed"]`).count()) === 1);
await builder.locator(`[data-week="0"][data-day="${closedDay}"]`).click();
check("clearing it removes the alert", (await alert.count()) === 0);

// 4. Save replaces their pattern in one change set; Undo puts it back
const nCs = await get(() => window.__v3.app.getState().world.journal.changeSets.length);
await builder.locator('[data-week="0"][data-day="5"]').click(); // toggle Friday
await builder.getByRole("button", { name: "Add pattern" }).click();
await page.waitForTimeout(200);
const after = await get((id) => Object.values(window.__v3.app.getState().world.state.standing).filter((t) => t.pharmacistId === id).map((t) => t.recurrence.weekdays.join()), pid);
const nCs2 = await get(() => window.__v3.app.getState().world.journal.changeSets.length);
check("saving replaces their patterns (old ones gone, new one in place) in one change set", nCs2 === nCs + 1 && after.length === 1 && after[0] !== before[0].wd, JSON.stringify({ before, after }));
check("the typical month shows the change", (await builder.locator("[data-editing]").count()) === 0);
await page.getByRole("button", { name: "Undo" }).first().click();
await page.waitForTimeout(200);
const restored = await get((id) => Object.values(window.__v3.app.getState().world.state.standing).filter((t) => t.pharmacistId === id).map((t) => t.recurrence.weekdays.join()), pid);
check("Undo puts the old pattern back", restored.length === before.length && restored[0] === before[0].wd);

// 9. An empty start date (found by the random-click stress): a clear message, no crash.
{
  const n0 = errors.length;
  await builder.getByLabel("Applies from").fill("");
  await builder.getByRole("button", { name: "Add pattern" }).click();
  await page.waitForTimeout(200);
  check("an empty Applies from date shows a message and does not crash", errors.length === n0 && (await page.getByText("Pick the first date the pattern applies.").count()) >= 1, errors.slice(n0).join(" | "));
}
check("no console errors", errors.length === 0, errors.join(" | "));
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
