// Browser check for the Travel & mileage, Rules and Setup Check views. Build first: npm run build:v3
// Screenshots (1366x800) go to $SHOTS or the OS temp dir.
import os from "node:os";
import path from "node:path";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const shots = process.env.SHOTS ?? os.tmpdir();
const srv = await serveV3();
const browser = await launch();
const { page, errors } = await openApp(browser, srv.base);

const get = (fn, arg) => page.evaluate(fn, arg);
const view = (v) => get((x) => window.__v3.app.getState().setView(x), v);
const state = () => get(() => JSON.parse(JSON.stringify(window.__v3.app.getState().world.state)));
/** Test setup only: swap the world for a modified copy (the app has no action that deletes a drive time). */
const mutate = async (fn, arg) => {
  await page.evaluate(({ src, arg }) => {
    const a = window.__v3.app.getState();
    const w = structuredClone(a.world);
    new Function("w", "arg", src)(w, arg);
    a.setWorld(w);
  }, { src: `(${fn.toString()})(w, arg)`, arg });
  await page.waitForTimeout(100);
};

const s0 = await state();
const stores = Object.values(s0.stores).sort((a, b) => (a.code < b.code ? -1 : 1));
// A pharmacist's base store and another store: the pair that matters.
const p0 = Object.values(s0.pharmacists).find((p) => p.baseStoreId);
const A = p0.baseStoreId;
const B = stores.find((s) => s.id !== A).id;
const code = (id) => s0.stores[id].code;

// ---------- Travel matrix ----------
await view("travel");
await page.waitForSelector("table[aria-label^='Drive']");
check("matrix has a cell for every ordered pair", (await page.locator("button[data-pair]").count()) === stores.length * (stores.length - 1));
check("a complete table shows no unknown cell", (await page.locator("button[data-level=unknown]").count()) === 0);
check("complete table says nothing is unknown that matters", await page.getByText("Every pair that matters is known.").isVisible());
check("fill button is idle when nothing is missing", await page.getByRole("button", { name: /Fill the Hi-School measured table/ }).isDisabled());

// Take one pair away in both directions, plus one direction of a second pair.
await mutate((w, arg) => { delete w.state.travel[`${arg.A}|${arg.B}`]; delete w.state.travel[`${arg.B}|${arg.A}`]; }, { A, B });
const unk = page.locator(`button[data-pair="${A}|${B}"]`);
check("deleted pair shows the ? cell", (await unk.textContent()).trim() === "?");
check("unknown cell says 'unknown' in its accessible name", ((await unk.getAttribute("aria-label")) ?? "").includes("unknown"));
check("unknown is never shown as 0", !(await unk.textContent()).includes("0"));
check("unknown pair that matters is listed with Add", (await page.locator("[data-testid=unknown-pairs] li", { hasText: `${code(A)} to ${code(B)}` }).count()) === 1);
await page.screenshot({ path: path.join(shots, "ref-travel-unknown.png") });

// Fill from the measured table: restores exactly the two missing directions, touches nothing else.
const before = await state();
const fillBtn = page.getByRole("button", { name: /Fill the Hi-School measured table \(adds 2\)/ });
check("fill button offers to add 2", await fillBtn.isVisible());
await fillBtn.click();
await page.waitForTimeout(150);
const afterFill = await state();
check("fill added both directions", !!afterFill.travel[`${A}|${B}`] && !!afterFill.travel[`${B}|${A}`]);
check("fill left existing pairs alone", Object.keys(before.travel).every((k) => JSON.stringify(before.travel[k]) === JSON.stringify(afterFill.travel[k])));
check("fill reports how many it added", /Added 2 drive times/.test((await page.locator("[role=status]").allTextContents()).join(" ")));

// Edit a pair: both directions change at once, History says which.
await page.locator(`button[data-pair="${A}|${B}"]`).click();
const form = page.getByRole("form", { name: new RegExp(`Edit drive time ${code(A)} to ${code(B)}`) });
await form.waitFor();
await form.getByLabel("Minutes (one way)").fill("123");
await form.getByLabel("Miles (one way)").fill("99.5");
await form.getByRole("button", { name: "Save both directions" }).click();
await page.waitForTimeout(150);
const edited = await state();
check("edit saved A to B", edited.travel[`${A}|${B}`].minutes === 123 && edited.travel[`${A}|${B}`].miles === 99.5);
check("edit saved B to A as well", edited.travel[`${B}|${A}`].minutes === 123 && edited.travel[`${B}|${A}`].miles === 99.5);
const label = await get(() => { const cs = window.__v3.app.getState().world.journal.changeSets; return cs[cs.length - 1].label; });
check("one change set labelled with the pair", label === `Updated drive time ${code(A)} - ${code(B)}.`, label);
check("123 minutes is highlighted over the soft limit", (await page.locator(`button[data-pair="${A}|${B}"]`).getAttribute("data-level")) === "soft");
check("soft glyph is shown", (await page.locator(`button[data-pair="${A}|${B}"]`).textContent()).includes("▲"));

// Bad input is refused in plain words.
await page.locator(`button[data-pair="${A}|${B}"]`).click();
const f2 = page.getByRole("form", { name: /Edit drive time/ });
await f2.getByLabel("Minutes (one way)").fill("abc");
await f2.getByRole("button", { name: "Save both directions" }).click();
check("bad minutes show an inline message", await page.getByText(/Minutes must be a whole number/).isVisible());
await f2.getByRole("button", { name: "Cancel" }).click();

// Miles toggle
await page.getByRole("button", { name: "Miles", exact: true }).click();
check("miles toggle shows miles", (await page.locator(`button[data-pair="${A}|${B}"]`).textContent()).includes("100") || (await page.locator(`button[data-pair="${A}|${B}"]`).textContent()).includes("99"));
await page.getByRole("button", { name: "Minutes", exact: true }).click();

// ---------- Mileage: a tiny seeded world, hand calculation ----------
// One pharmacist at base A works twice at B (miles 102.1) and once at C (no pair). Free miles 20, rate 70c.
const C = stores.find((s) => s.id !== A && s.id !== B).id;
const win = await get(() => window.__v3.app.getState().window);
const ym = win.from.slice(0, 7);
await mutate((w, arg) => {
  const st = w.state;
  st.assignments = {};
  for (const [i, [store, day]] of [[arg.B, "05"], [arg.B, "06"], [arg.C, "07"]].entries()) {
    st.assignments[`T${i + 1}`] = { id: `T${i + 1}`, date: `${arg.ym}-${day}`, storeId: store, pharmacistId: arg.P, placedSeq: i + 1, source: "manual", agreed: true, pinned: false };
  }
  st.overrides = {};
  st.travel = {};
  st.travel[`${arg.A}|${arg.B}`] = { fromStoreId: arg.A, toStoreId: arg.B, minutes: 130, miles: 102.1 };
  st.config.mileageRates = [];
  st.config.mileageFreeMiles = 20;
}, { A, B, C, P: p0.id, ym });
await page.waitForTimeout(100);
check("no rate: warns that nothing can be priced", await page.getByText(/No mileage rate is set yet/).isVisible());
await page.getByLabel("New rate starts").fill(`${ym}-01`);
await page.getByLabel("Cents per mile", { exact: true }).fill("70");
await page.getByRole("button", { name: "Add rate" }).click();
await page.waitForTimeout(150);
check("rate added through config.set", (await state()).config.mileageRates.length === 1 && (await state()).config.mileageRates[0].centsPerMile === 70);
// 2 trips x 2 x (102.1 - 20) x 70 = 2 x 11494 = 22988 cents
const total = (await page.locator("[data-testid=mileage-total]").textContent()) ?? "";
check("report total matches the hand calculation ($229.88, 2 trips)", total.includes("$229.88") && total.includes("2 trips"), total);
check("unknown pair is listed apart as Miles not known", await page.getByRole("region", { name: "Miles not known" }).isVisible());
check("unknown pair is not counted as zero trips", !total.includes("3 trips"));
// Free miles 25 changes the pay: 2 x 2 x (102.1 - 25) x 70 = 21588 -> $215.88
await page.getByLabel("Free miles (one way, not paid)").fill("25");
await page.getByRole("group", { name: "Mileage settings" }).getByRole("button", { name: "Save", exact: true }).first().click();
await page.waitForTimeout(150);
check("free miles saved", (await state()).config.mileageFreeMiles === 25);
check("report follows the new free miles ($215.88)", ((await page.locator("[data-testid=mileage-total]").textContent()) ?? "").includes("$215.88"));
// CSV: clipboard if allowed, otherwise a visible textarea
await page.getByRole("button", { name: "Copy as CSV" }).click();
await page.waitForTimeout(300);
const ta = page.locator("#csv-text");
const copied = (await page.locator("[role=status]").allTextContents()).join(" ").includes("Copied");
check("copy as CSV copies or shows the text", copied || (await ta.isVisible()));
if (!copied) check("fallback textarea holds the CSV", ((await ta.inputValue()) ?? "").startsWith("Pharmacist,Base store"));
await get(() => document.querySelector("main").scrollTo(0, 10000));
await page.waitForTimeout(100);
await page.screenshot({ path: path.join(shots, "ref-mileage.png") });

// ---------- Rules ----------
await view("rules");
await page.waitForSelector("table[aria-label=Rules]");
check("rules table has 7 rows", (await page.locator("tr[data-rule]").count()) === 7);
check("licensing sentence is shown", await page.getByText(/Licensing can never be overridden/).isVisible());
check("engine version is shown", /Engine version v/.test((await page.getByTestId("engine-version").textContent()) ?? ""));
const licRow = await page.locator("tr[data-rule=licensing] td:nth-child(4)").innerText();
check("licensing row says it cannot be overridden", licRow.trim() === "No", licRow);
await page.getByLabel(/^Long drive/).fill("80");
await page.getByRole("button", { name: "Save settings" }).click();
await page.waitForTimeout(150);
check("changing a threshold persists in state", (await state()).config.travelSoftMinutes === 80);
await page.getByLabel(/^Hard drive limit/).fill("70");
check("soft above hard is refused in words", await page.getByText(/cannot be lower than the long drive/).isVisible());
check("save is disabled while invalid", await page.getByRole("button", { name: "Save settings" }).isDisabled());
await page.getByLabel(/^Hard drive limit/).fill("160");
await page.getByLabel(/^Search effort/).fill("12.5");
check("non-integer is refused", await page.getByText(/Use a whole number\./).isVisible());
await page.getByLabel(/^Search effort/).fill("300000");
await page.getByLabel(/^Leave the next days alone/).fill("10");
await page.getByRole("button", { name: "Save settings" }).click();
await page.waitForTimeout(150);
const cfg = (await state()).config;
check("hard limit, search limit and Improve numbers saved", cfg.travelHardMinutes === 160 && cfg.searchNodeLimit === 300000 && cfg.improve.excludeNextDays === 10 && cfg.improve.maxChanged === 10);
await page.screenshot({ path: path.join(shots, "ref-rules.png") });

// ---------- Setup Check ----------
await mutate((w, arg) => { delete w.state.pharmacists[arg.P].licenses; w.state.pharmacists[arg.P].baseStoreId = null; }, { P: p0.id });
await view("checks");
await page.waitForSelector("[data-testid=checks-count]");
const licItem = page.locator(`li[data-check="lic|${p0.id}"]`);
check("a pharmacist with no licenses is listed", await licItem.isVisible());
check("a pharmacist with no base store is listed", await page.locator(`li[data-check="base|${p0.id}"]`).isVisible());
check("legend lists the wall marks", (await page.locator("table[aria-label='Wall marks'] tbody tr").count()) >= 8);
await page.screenshot({ path: path.join(shots, "ref-checks.png") });
await licItem.getByRole("button").click();
check("the fix button navigates to Setup", (await get(() => window.__v3.app.getState().view)) === "setup");

// Unknown travel for a placement in the next 8 weeks shows up with a jump to Travel.
await mutate((w, arg) => {
  const asOf = window.__v3.app.getState().asOf;
  w.state.pharmacists[arg.P].baseStoreId = arg.A;
  delete w.state.travel[`${arg.A}|${arg.B}`];
  const d = asOf;
  w.state.assignments.TX = { id: "TX", date: d, storeId: arg.B, pharmacistId: arg.P, placedSeq: 99, source: "manual", agreed: true, pinned: false };
}, { A, B, P: p0.id });
await view("checks");
const trItem = page.locator(`li[data-check="travel|${A}|${B}"]`);
check("unknown drive time for a coming placement is listed", await trItem.isVisible());
await trItem.getByRole("button").click();
check("its button navigates to Travel", (await get(() => window.__v3.app.getState().view)) === "travel");

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
srv.close();
console.log(failed() ? `\n${failed()} check(s) FAILED` : "\nall ok");
process.exit(failed() ? 1 : 0);
