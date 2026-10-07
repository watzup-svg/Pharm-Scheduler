// v3 browser check: Start screen paths, practice month, importing an old file, and the Setup view.
//   npm run build:v3 && node e2e/v3-setup.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shots = process.env.SHOTS ?? path.join(os.tmpdir(), "v3-setup-shots");
fs.mkdirSync(shots, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(shots, `v3-setup-${name}.png`) });

const srv = await serveV3();
const browser = await launch();
const worldOf = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__v3.app.getState().world?.state ?? null)));

try {
  // ---------- Start screen ----------
  {
    const { page, errors } = await openApp(browser, srv.base, { practice: false });
    await page.waitForSelector("text=Open a schedule file");
    check("start: three paths", (await page.getByRole("heading", { name: "Open a schedule file" }).count()) === 1
      && (await page.getByRole("heading", { name: "Bring in a file from the old scheduler" }).count()) === 1
      && (await page.getByRole("heading", { name: "Start a new schedule" }).count()) === 1);
    check("start: practice link, labelled invented", (await page.getByRole("button", { name: "Try the practice month" }).count()) === 1 && (await page.getByText("invented").count()) >= 1);
    await shot(page, "start");

    // open with the stand-in save layer: cancelled, stays on Start
    await page.getByRole("button", { name: "Open a schedule file" }).click();
    await page.waitForTimeout(150);
    check("start: cancelled open stays on start", (await page.evaluate(() => window.__v3.app.getState().world)) === null);

    // import
    await page.setInputFiles('input[data-testid="import-input"]', path.join(root, "fixtures", "sample-v2.json"));
    await page.waitForSelector("text=Here is what was brought in");
    const reportText = await page.locator('section[aria-label="What was brought in"]').innerText();
    check("import: report shows counts and months", /2026-09/.test(reportText) && /stores/.test(reportText) && /shifts placed/.test(reportText), reportText.slice(0, 200));
    check("import: report lists left-out and choices", /left out/i.test(reportText) && /choices made for you/i.test(reportText));
    await shot(page, "import-report");
    await page.getByRole("button", { name: "Open it" }).click();
    await page.waitForTimeout(200);
    const w = await worldOf(page);
    check("import: opens a world with stores and assignments", w && Object.keys(w.stores).length >= 3 && Object.keys(w.assignments).length > 0);

    // a file that is not a schedule is refused in words
    const p2 = await openApp(browser, srv.base, { practice: false });
    fs.writeFileSync(path.join(shots, "not-a-schedule.json"), JSON.stringify({ hello: "world" }));
    await p2.page.setInputFiles('input[data-testid="import-input"]', path.join(shots, "not-a-schedule.json"));
    await p2.page.waitForSelector("text=Nothing could be brought in");
    check("import: wrong file is explained", true);
    // new schedule with the Hi-School pharmacies
    await p2.page.getByRole("button", { name: "Start a new schedule" }).click();
    await shot(p2.page, "new");
    await p2.page.getByRole("button", { name: "Create and go to Setup" }).click();
    await p2.page.waitForTimeout(200);
    const nw = await worldOf(p2.page);
    check("new: Hi-School stores, drive times, no pharmacists", Object.keys(nw.stores).length === 16 && Object.keys(nw.pharmacists).length === 0 && Object.keys(nw.travel).length > 200, `${Object.keys(nw.stores).length} stores, ${Object.keys(nw.travel).length} travel`);
    check("new: state read from address", nw.stores.S1.code === "CAT" && nw.stores.S1.state === "WA");
    check("new: goes to Setup", (await p2.page.evaluate(() => window.__v3.app.getState().view)) === "setup");
    check("start: no page errors", errors.length === 0 && p2.errors.length === 0, [...errors, ...p2.errors].join("; "));
    await page.close(); await p2.page.close();
  }

  // practice month
  {
    const { page } = await openApp(browser, srv.base, { practice: false });
    await page.getByRole("button", { name: "Try the practice month" }).click();
    await page.waitForTimeout(200);
    check("practice: opens", (await page.evaluate(() => window.__v3.app.getState().world)) !== null);
    await page.close();
  }

  // ---------- Setup ----------
  {
    const { page, errors } = await openApp(browser, srv.base, { practice: true });
    await page.evaluate(() => window.__v3.app.getState().setView("setup"));
    await page.waitForSelector("role=tab[name='Stores']");
    const asOf = await page.evaluate(() => window.__v3.app.getState().asOf);
    const before = await worldOf(page);
    await shot(page, "stores");

    // --- add a store (validation first)
    await page.getByRole("button", { name: "Add a store" }).click();
    const sg = page.getByRole("group", { name: "Add a store" });
    await sg.getByRole("button", { name: "Add store" }).click();
    check("store: missing code explained", (await sg.getByText("Give the store a short code").count()) === 1);
    await sg.getByLabel("Code").fill("TST");
    await sg.getByLabel("Name").fill("Testville Pharmacy");
    await sg.getByLabel("State").selectOption("WA");
    await sg.getByRole("button", { name: "Add store" }).click();
    await page.waitForTimeout(150);
    let w = await worldOf(page);
    const store = Object.values(w.stores).find((s) => s.code === "TST");
    check("store: added with state", !!store && store.state === "WA" && store.name === "Testville Pharmacy");
    const maxBefore = Math.max(...Object.keys(before.stores).map((k) => Number(k.slice(1))));
    check("store: id is one past the biggest", store && store.id === `S${maxBefore + 1}`, store?.id);
    check("store: weekly need Mon 1, Sun 0", store && w.requirements[`${store.id}|1|0001-01-01`]?.count === 1 && w.requirements[`${store.id}|0|0001-01-01`]?.count === 0);
    check("store: history says what happened", (await page.evaluate(() => window.__v3.app.getState().world.journal.changeSets.at(-1).label)) === "Added store TST.");

    // duplicate code is refused in words
    await page.getByRole("button", { name: "Add a store" }).click();
    await sg.getByLabel("Code").fill("tst");
    await sg.getByLabel("Name").fill("Another");
    await sg.getByRole("button", { name: "Add store" }).click();
    check("store: duplicate code explained", (await sg.getByText("Another store already uses the code TST").count()) === 1);
    await sg.getByRole("button", { name: "Cancel" }).click();

    // --- edit the weekly need from the as-of date
    await page.getByRole("button", { name: "Edit store TST" }).click();
    const eg = page.getByRole("group", { name: "Edit store TST" });
    await page.evaluate(() => document.querySelector("main").scrollTo(0, 0));
    await shot(page, "store-editor");
    await eg.getByLabel("Monday pharmacists needed").fill("2");
    await eg.getByRole("button", { name: "Save weekly need" }).click();
    await page.waitForTimeout(150);
    w = await worldOf(page);
    check("requirement: new row from the chosen date", w.requirements[`${store.id}|1|${asOf}`]?.count === 2 && w.requirements[`${store.id}|1|0001-01-01`]?.count === 1);
    check("requirement: history list shows both", (await eg.getByText(/1 from the beginning, then 2 from/).count()) === 1);
    const monNeed = await page.locator('[data-store-row="TST"] [data-need-marks] [data-weekday="Mon"]').getAttribute("data-need");
    check("requirement: the week marks show 2 for Monday", monNeed === "2", String(monNeed));
    // the wall's own numbers come from these rows
    const need = { req: Object.values(w.requirements).filter((r) => r.storeId === store.id && r.weekday === 1).map((r) => r.count) };
    check("requirement: wall data holds both rows", need.req.length === 2);
    await eg.getByRole("button", { name: "Done" }).click();

    // mark inactive from, never delete
    check("store: no delete button anywhere", (await page.getByRole("button", { name: /delete/i }).count()) === 0);
    await page.getByRole("button", { name: "Edit store TST" }).click();
    await eg.getByLabel("First closed day").fill("2027-01-01");
    await eg.getByRole("button", { name: /Mark inactive from/ }).click();
    await page.waitForTimeout(150);
    w = await worldOf(page);
    check("store: marked inactive from a date", w.stores[store.id].inactiveFrom === "2027-01-01");
    await eg.getByRole("button", { name: "Done" }).click();
    await shot(page, "stores-edited");

    // --- pharmacists
    await page.getByRole("tab", { name: "People", exact: true }).click();
    await page.getByRole("button", { name: "Add a pharmacist" }).click();
    const pg = page.getByRole("group", { name: "Add a pharmacist" });
    await pg.getByLabel("Name").fill("Tess Tester");
    check("pharmacist: initials suggested", (await pg.getByLabel("Initials").inputValue()) === "TT");
    await pg.getByLabel("Base store").selectOption({ label: "TST  Testville Pharmacy" });
    await pg.getByRole("checkbox", { name: /Oregon/ }).check();
    await pg.getByLabel("Oregon license last valid day").fill("2027-06-30");
    await shot(page, "pharmacist-editor");
    await pg.getByRole("button", { name: "Add pharmacist" }).click();
    await page.waitForTimeout(150);
    w = await worldOf(page);
    const ph = Object.values(w.pharmacists).find((p) => p.name === "Tess Tester");
    check("pharmacist: added with a license and last valid day", !!ph && ph.licenses?.OR === "2027-06-30" && !("WA" in ph.licenses) && ph.baseStoreId === store.id, JSON.stringify(ph));
    // duplicate initials warns, does not block
    await page.getByRole("button", { name: "Add a pharmacist" }).click();
    await pg.getByLabel("Name").fill("Tom Tester");
    await pg.getByLabel("Initials").fill("TT");
    check("pharmacist: duplicate initials warned", (await pg.getByText(/also uses TT/).count()) === 1);
    await pg.getByRole("radio", { name: "Not recorded" }).check();
    await pg.getByRole("button", { name: "Add pharmacist" }).click();
    await page.waitForTimeout(150);
    w = await worldOf(page);
    const tom = Object.values(w.pharmacists).find((p) => p.name === "Tom Tester");
    check("pharmacist: not recorded stores no license map", !!tom && tom.licenses === undefined);
    check("pharmacist: table says not recorded", (await page.locator('[data-pharmacist-row="Tom Tester"]').innerText()).includes("Not recorded"));

    // --- patterns
    await page.getByRole("tab", { name: "Patterns" }).click();
    const ag = page.getByRole("group", { name: "Add a pattern" });
    await ag.getByRole("button", { name: "Add pattern" }).click();
    check("pattern: missing parts explained", (await ag.getByText("Choose a store.").count()) === 1 && (await ag.getByText("Tick at least one weekday.").count()) === 1);
    await ag.getByLabel("Store", { exact: true }).selectOption(store.id);
    await ag.getByLabel("Pharmacist", { exact: true }).selectOption(ph.id);
    await ag.getByRole("checkbox", { name: "Mon" }).check();
    await ag.getByRole("checkbox", { name: "Wed" }).check();
    await ag.getByLabel("Repeats").selectOption("2");
    const hits = await ag.getByTestId("pattern-preview").locator('[data-hit="yes"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-date")));
    check("pattern: preview shows 4 weeks, every 2nd week Mon/Wed = 3 or 4 days (first week starts today)", hits.length >= 3 && hits.length <= 4, JSON.stringify(hits));
    check("pattern: preview only Mon/Wed", hits.every((d) => [1, 3].includes(new Date(`${d}T12:00:00Z`).getUTCDay())), JSON.stringify(hits));
    await shot(page, "pattern-builder");
    await ag.getByRole("button", { name: "Add pattern" }).click();
    await page.waitForTimeout(150);
    w = await worldOf(page);
    const t = Object.values(w.standing).find((x) => x.storeId === store.id && x.pharmacistId === ph.id);
    check("pattern: added", !!t && t.recurrence.weekdays.join() === "1,3" && t.recurrence.cycleWeeks === 2, JSON.stringify(t));
    check("pattern: appears in the list", (await page.locator(`tr[data-pattern="${t.id}"]`).count()) === 1);

    // conflict: same pharmacist, another store, same days
    const other = Object.values(w.stores).find((s) => s.code !== "TST");
    await ag.getByLabel("Store", { exact: true }).selectOption(other.id);
    await ag.getByLabel("Pharmacist", { exact: true }).selectOption(ph.id);
    await ag.getByRole("checkbox", { name: "Mon" }).check();
    await ag.getByRole("checkbox", { name: "Wed" }).check();
    await ag.getByLabel("Repeats").selectOption("2");
    check("pattern: conflict warned before adding", (await ag.getByText("Build will skip both: pattern conflict").count()) >= 1);
    await ag.getByRole("button", { name: "Add pattern" }).click();
    await page.waitForTimeout(150);
    check("pattern: conflict banner after adding", (await page.getByRole("alert", { name: "Pattern conflicts" }).count()) === 1);
    await page.evaluate(() => document.querySelector("main").scrollTo(0, 0));
    await shot(page, "patterns-conflict");
    const t2 = Object.values((await worldOf(page)).standing).find((x) => x.storeId === other.id && x.pharmacistId === ph.id);
    await page.getByRole("button", { name: `Remove pattern ${t2.id}` }).click();
    await page.waitForTimeout(150);
    w = await worldOf(page);
    check("pattern: removed", !w.standing[t2.id] && !!w.standing[t.id]);
    check("pattern: banner gone after removing", (await page.getByRole("alert", { name: "Pattern conflicts" }).count()) === 0);

    // usual days off: split days, every second week, recorded as approved time off in one change set
    await ag.getByRole("button", { name: "Usual days off" }).click();
    check("days off: no store to choose", (await ag.getByLabel("Store", { exact: true }).count()) === 0);
    await ag.getByLabel("Pharmacist", { exact: true }).selectOption(ph.id);
    await ag.getByRole("checkbox", { name: "Tue" }).check();
    await ag.getByRole("checkbox", { name: "Thu" }).check();
    await ag.getByLabel("Repeats").selectOption("2");
    check("days off: it says how many days it will mark", /days off through/.test(await ag.getByTestId("days-off-summary").innerText()));
    const nCs = (await worldOf(page)) && (await page.evaluate(() => window.__v3.app.getState().world.journal.changeSets.length));
    await ag.getByRole("button", { name: "Mark days off" }).click();
    await page.waitForTimeout(150);
    const recs = await page.evaluate((id) => Object.values(window.__v3.app.getState().world.state.unavailability).filter((u) => u.pharmacistId === id && u.note === "Usual day off"), ph.id);
    const nCs2 = await page.evaluate(() => window.__v3.app.getState().world.journal.changeSets.length);
    check("days off: approved time-off records, 'Usual day off', Tue/Thu only, in one change set", recs.length >= 6 && recs.every((u) => u.status === "Approved" && [2, 4].includes(new Date(`${u.first}T12:00:00Z`).getUTCDay()) && u.first === u.last) && nCs2 === nCs + 1, `${recs.length} records, ${nCs2 - nCs} change sets`);
    await page.getByRole("button", { name: "Undo" }).first().click();
    await page.waitForTimeout(150);
    check("days off: Undo takes them all back", (await page.evaluate((id) => Object.values(window.__v3.app.getState().world.state.unavailability).filter((u) => u.pharmacistId === id && u.note === "Usual day off").length, ph.id)) === 0);
    await ag.getByRole("button", { name: "Works at a store" }).click();

    // --- dates
    await page.getByRole("tab", { name: "Dates" }).click();
    const dg = page.getByRole("group", { name: "Add a date change" });
    await dg.getByLabel("Date", { exact: true }).fill("2026-11-26");
    await dg.getByLabel("Note (optional)").fill("Thanksgiving");
    await dg.getByRole("button", { name: "Close all stores on this date" }).click();
    await page.waitForTimeout(150);
    w = await worldOf(page);
    const closed = Object.values(w.dateOverrides).filter((o) => o.date === "2026-11-26" && o.count === 0 && o.note === "Thanksgiving");
    check("dates: close all stores", closed.length === Object.values(w.stores).filter((s) => !(s.inactiveFrom && s.inactiveFrom <= "2026-11-26")).length, `${closed.length}`);
    await dg.getByLabel("Store", { exact: true }).selectOption(store.id);
    await dg.getByLabel("What happens").selectOption("extra");
    await dg.getByLabel("How many more").fill("1");
    await dg.getByLabel("Date", { exact: true }).fill("2026-12-07");
    await dg.getByLabel("Note (optional)").fill("Flu clinic");
    await dg.getByRole("button", { name: "Save date change" }).click();
    await page.waitForTimeout(150);
    w = await worldOf(page);
    check("dates: clinic is usual + 1", w.dateOverrides[`${store.id}|2026-12-07`]?.count === 3, JSON.stringify(w.dateOverrides[`${store.id}|2026-12-07`]));
    await page.getByLabel("Store", { exact: true }).last().selectOption(store.id);
    check("dates: filter by store", (await page.locator("tr[data-override]").count()) === 2);
    await shot(page, "dates");
    await page.getByRole("button", { name: `Remove ${store.code} on 2026-12-07` }).click();
    await page.waitForTimeout(150);
    check("dates: removed", !(await worldOf(page)).dateOverrides[`${store.id}|2026-12-07`]);

    // undoable like everything else
    const last = await page.evaluate(() => { const s = window.__v3.app.getState(); const cs = s.world.journal.changeSets.at(-1); return { id: cs.id, label: cs.label, ok: s.undo(cs.id) }; });
    check("setup edits are change sets and undo", last.ok && !!(await worldOf(page)).dateOverrides[`${store.id}|2026-12-07`], last.label);

    check("setup: no page errors", errors.length === 0, errors.join("; "));
    await page.close();
  }
} finally {
  await browser.close();
  srv.close();
}
process.exit(failed() ? 1 : 0);
