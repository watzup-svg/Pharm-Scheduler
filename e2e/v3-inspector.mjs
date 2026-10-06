// Inspector checks on the practice month. Build first: npm run build:v3
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const shot = process.env.SHOT ?? path.join(here, "..", "dist-v3", "inspector-1366x800.png");

const srv = await serveV3();
const browser = await launch();
const { page, errors } = await openApp(browser, srv.base);
const insp = page.locator('aside[aria-label="Inspector"]');
const get = (fn, arg) => page.evaluate(fn, arg);
const settle = async () => { await page.waitForTimeout(100); await page.waitForFunction(() => !window.__v3.app.getState().busy); await page.waitForTimeout(100); };
const status = async () => (await insp.getByTestId("cell-status").innerText()).trim();
const select = async (sel) => { await get((s) => window.__v3.app.getState().select(s), sel); await settle(); };
const commit = (edits) => get((e) => window.__v3.app.getState().commit(e), edits);

// An open day at Rogue River (S10) on 2026-10-07: its one pharmacist is removed. Another store (S2) gets an extra
// pharmacist the same day, so Find cover has ordinary options (checked against the practice data).
const cell = await get(() => {
  const st = window.__v3.app.getState().world.state;
  const a = Object.values(st.assignments).find((x) => x.storeId === "S10" && x.date === "2026-10-07");
  return { storeId: a.storeId, date: a.date, id: a.id, pharmacistId: a.pharmacistId };
});
const s2People = await get((c) => Object.values(window.__v3.app.getState().world.state.assignments).filter((a) => a.storeId === "S2" && a.date === c.date).map((a) => a.pharmacistId), cell);
await commit([{ t: "place", storeId: "S2", pharmacistId: "P5", date: cell.date }]);
await commit([{ t: "remove", assignmentId: cell.id }]);
await select({ storeId: cell.storeId, date: cell.date });

// 1. empty state and open cell
await select(null);
check("empty state shows one hint", /Select a store day or a person/.test(await insp.innerText()));
await select({ storeId: cell.storeId, date: cell.date });
check("open cell says Needs 1 more", (await status()) === "Needs 1 more", await status());
check("counts in words", /Needs one; nobody counted/.test(await insp.getByTestId("cell-counts").innerText()));
const rows = insp.locator('ul[aria-label="Who can work here"] > li');
check("choices render", (await rows.count()) === 8, String(await rows.count()));
check("Show all is offered", await insp.getByRole("button", { name: /^Show all \(\d+\)$/ }).isVisible());
await insp.getByRole("button", { name: /^Show all/ }).click();
check("Show all lists everyone", (await rows.count()) > 8);
await insp.getByRole("button", { name: "Show fewer" }).click();
check("Find cover button is shown for an open cell", await insp.getByRole("button", { name: "Find cover" }).isVisible());

// 2. place someone: the cell becomes covered
const placeBtn = insp.locator('button[aria-label^="Place: "]:not([disabled]), button[aria-label^="Move here: "]:not([disabled])').first();
const placedLabel = await placeBtn.getAttribute("aria-label");
await placeBtn.click();
await settle();
check("placing makes the cell covered", (await status()).startsWith("Covered"), await status());
check("selection kept after commit", await get(() => { const s = window.__v3.app.getState().selection; return !!s && !!s.storeId; }));
const placed = await get((c) => Object.values(window.__v3.app.getState().world.state.assignments).filter((a) => a.storeId === c.storeId && a.date === c.date).map((a) => ({ id: a.id, p: a.pharmacistId, src: a.source, agreed: a.agreed })), cell);
check("a manual unconfirmed assignment was written", placed.length === 1 && placed[0].src === "manual" && !placed[0].agreed, JSON.stringify(placed));
check("row says who placed it", /Placed by you\./.test(await insp.innerText()) && /Unconfirmed/.test(await insp.innerText()));
void placedLabel;

// row actions: agreed, pin, partial note
await insp.getByRole("button", { name: "Mark agreed" }).click(); await settle();
check("Mark agreed", await get((id) => window.__v3.app.getState().world.state.assignments[id].agreed, placed[0].id));
await insp.getByRole("button", { name: "Pin", exact: true }).click(); await settle();
check("Pin", await get((id) => window.__v3.app.getState().world.state.assignments[id].pinned, placed[0].id));
check("Unpin is offered", await insp.getByRole("button", { name: "Unpin", exact: true }).isVisible());
await insp.getByRole("button", { name: "Unpin", exact: true }).click(); await settle();
await insp.getByRole("button", { name: "Add partial-day note" }).click();
await insp.getByRole("textbox", { name: /Partial-day note/ }).fill("leaves at 2pm");
await insp.getByRole("button", { name: "Save note" }).click(); await settle();
check("partial-day note saved and shown", /leaves at 2pm/.test(await insp.innerText()));
await insp.getByRole("button", { name: "Edit partial-day note" }).click();
await insp.getByRole("button", { name: "Clear note" }).click(); await settle();
check("partial-day note cleared", !(await get((id) => window.__v3.app.getState().world.state.assignments[id].partialNote, placed[0].id)));

// remove through the inline confirm
await insp.getByRole("button", { name: "Remove", exact: true }).click();
check("remove asks inline", await insp.getByRole("button", { name: "Yes, remove" }).isVisible());
await insp.getByRole("button", { name: "Yes, remove" }).click(); await settle();
check("removed, cell open again", (await status()) === "Needs 1 more");

// 3. accept an override with a reason. Make a free person unavailable, place them anyway, then accept.
const freeId = await insp.locator("ul[aria-label='Who can work here'] > li").first().getAttribute("data-pharmacist");
await commit([{ t: "unavail.add", pharmacistId: freeId, first: cell.date, last: cell.date, status: "Approved", type: "Vacation" }]);
await settle();
await insp.getByRole("button", { name: /^Show all/ }).click(); // unavailable people sort last
const anyway = insp.locator(`li[data-pharmacist="${freeId}"]`).getByRole("button", { name: /anyway/ });
check("blocked non-licensing choice offers Place anyway", await anyway.isVisible());
check("its line says why", /Not available: vacation/.test(await insp.locator(`li[data-pharmacist="${freeId}"]`).innerText()));
await anyway.click(); await settle();
check("placed anyway does not cover", (await status()) === "Needs 1 more", await status());
check("failure is shown in plain words with its fix", /Not available: vacation\./.test(await insp.innerText()) && /Pick someone who is available/.test(await insp.innerText()));
await insp.getByRole("button", { name: "Accept anyway" }).click();
const accept = insp.getByRole("button", { name: "Accept", exact: true });
check("reason is required for availability", await accept.isDisabled());
await insp.getByRole("textbox", { name: /Why are you accepting this/ }).fill("Covering a shift swap she agreed to");
await accept.click(); await settle();
const ov = await get(() => Object.values(window.__v3.app.getState().world.state.overrides));
check("override stored with the reason", ov.length === 1 && ov[0].ruleId === "availability" && ov[0].reason === "Covering a shift swap she agreed to", JSON.stringify(ov));
check("accepted failure reads Accepted: <reason>", /Accepted: Covering a shift swap/.test(await insp.innerText()));
check("cell is covered after accepting", (await status()).startsWith("Covered"), await status());
await insp.getByRole("button", { name: "Remove acceptance" }).click(); await settle();
check("Remove acceptance deletes the override", (await get(() => Object.keys(window.__v3.app.getState().world.state.overrides).length)) === 0);
check("open again after removing acceptance", (await status()) === "Needs 1 more");
// clean up this assignment and the vacation
const bad = await get((c) => Object.values(window.__v3.app.getState().world.state.assignments).find((a) => a.storeId === c.storeId && a.date === c.date).id, cell);
await commit([{ t: "remove", assignmentId: bad }]);
const un = await get(() => Object.keys(window.__v3.app.getState().world.state.unavailability).pop());
await commit([{ t: "unavail.remove", id: un }]);
await settle();

// 4. licensing is a hard stop everywhere
const wa = await get(() => {
  const s = window.__v3.app.getState();
  const st = s.world.state;
  const unl = Object.values(st.pharmacists).find((p) => p.licenses && !("WA" in p.licenses));
  const wa = Object.values(st.stores).find((x) => x.state === "WA");
  const busy = new Set(Object.values(st.assignments).filter((a) => a.pharmacistId === unl.id).map((a) => a.date));
  const date = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].find((d) => !busy.has(d));
  return { storeId: wa.id, pharmacistId: unl.id, name: unl.name, date };
});
await select({ storeId: wa.storeId, date: wa.date });
const unlicRow = insp.locator(`li[data-pharmacist="${wa.pharmacistId}"]`);
check("unlicensed choice says Not licensed in WA", /Not licensed in WA/.test(await unlicRow.innerText()));
check("unlicensed choice has only a disabled button", (await unlicRow.getByRole("button").count()) === 1 && (await unlicRow.getByRole("button").isDisabled()));
check("no Place anyway for licensing", (await unlicRow.getByRole("button", { name: /anyway/ }).count()) === 0);
await commit([{ t: "place", storeId: wa.storeId, pharmacistId: wa.pharmacistId, date: wa.date }]);
await settle();
const wrow = insp.getByRole("listitem", { name: wa.name });
check("placed unlicensed person fails in plain words", /Not licensed in WA\./.test(await wrow.innerText()));
check("licensing shows a hard stop", /hard stop/i.test(await wrow.innerText()));
check("licensing shows no accept button", (await wrow.locator("li", { hasText: "hard stop" }).getByRole("button", { name: /Accept/ }).count()) === 0);
const lic = await get((a) => window.__v3.app.getState().commit([{ t: "override", assignmentId: Object.values(window.__v3.app.getState().world.state.assignments).find((x) => x.pharmacistId === a.p && x.date === a.d).id, ruleId: "licensing", reason: "x" }]), { p: wa.pharmacistId, d: wa.date });
check("domain also refuses a licensing override", lic === false);
await get(() => window.__v3.app.getState().clearNotice());
await get((a) => { const w = window.__v3.app.getState().world.state; return window.__v3.app.getState().commit([{ t: "remove", assignmentId: Object.values(w.assignments).find((x) => x.pharmacistId === a.p && x.date === a.d).id }]); }, { p: wa.pharmacistId, d: wa.date });

// 5. swap mode lists choices and swaps
await select({ storeId: cell.storeId, date: cell.date });
await insp.locator('button[aria-label^="Place: "]:not([disabled])').first().click(); await settle();
await insp.getByRole("button", { name: "Swap to someone else" }).click();
check("swap mode shows a swap list", await insp.getByText(/Pick who takes the place/).isVisible());
const swapBtn = insp.locator('button[aria-label^="Swap in: "]:not([disabled])').first();
const swapName = (await swapBtn.getAttribute("aria-label")).replace("Swap in: ", "");
await swapBtn.click(); await settle();
check("swap replaced the person", (await insp.getByRole("listitem", { name: swapName }).count()) === 1 && /Unconfirmed/.test(await insp.innerText()));
const remaining = await get((c) => Object.values(window.__v3.app.getState().world.state.assignments).filter((a) => a.storeId === c.storeId && a.date === c.date).length, cell);
check("exactly one assignment after swap", remaining === 1);
await insp.getByRole("button", { name: "Remove", exact: true }).click();
await insp.getByRole("button", { name: "Yes, remove" }).click(); await settle();

// 6. cell controls
await insp.getByRole("button", { name: "More: Accept being short" }).click(); await settle();
check("accept being short", (await status()) === "Accepted short", await status());
await insp.getByRole("button", { name: "Fewer: Accept being short" }).click(); await settle();
await insp.getByRole("button", { name: "More: Locum cover" }).click(); await settle();
check("a locum covers the cell", (await status()).startsWith("Covered") && /one locum/.test(await insp.getByTestId("cell-counts").innerText()), await status());
await insp.getByRole("button", { name: "Fewer: Locum cover" }).click(); await settle();
await insp.getByRole("button", { name: "Close this store this day" }).click();
const closeBtn = insp.getByRole("button", { name: "Close the day" });
check("closing asks for a note, not a dialog", await closeBtn.isDisabled());
await insp.getByRole("textbox", { name: /^Note/ }).fill("Inventory");
await closeBtn.click(); await settle();
check("closed with the note shown", (await status()) === "Closed (Inventory)", await status());
await insp.getByRole("button", { name: "Reopen" }).click(); await settle();
check("reopened", (await status()) === "Needs 1 more", await status());
await insp.getByRole("button", { name: /^Extra clinic/ }).click();
await insp.getByRole("textbox", { name: /^Note/ }).fill("Flu clinic");
await insp.getByRole("button", { name: /Save extra clinic/ }).click(); await settle();
check("extra clinic raises the need", (await status()) === "Needs 2 more", await status());
await insp.getByRole("button", { name: "Back to the usual" }).click(); await settle();

// 7. Find cover and Preview (the earlier steps may have moved P5 away from S2; put the extra pharmacist back)
await get(({ c, s2People }) => {
  const g = () => window.__v3.app.getState();
  for (const p of [...s2People, "P5"]) if (!Object.values(g().world.state.assignments).some((a) => a.pharmacistId === p && a.date === c.date)) g().commit([{ t: "place", storeId: "S2", pharmacistId: p, date: c.date }]);
}, { c: cell, s2People });
await settle();
await insp.getByRole("button", { name: "Find cover" }).click(); await settle();
const options = insp.locator("ol > li");
const nOpt = await options.count();
if (false) console.log(await get((c) => JSON.stringify(Object.values(window.__v3.app.getState().world.state.assignments).filter((a) => a.date === c.date && ["S2", "S10"].includes(a.storeId))) + JSON.stringify(window.__v3.app.getState().repairResult?.result).slice(0, 300), cell));
const resText = await insp.innerText();
check("Find cover shows options or a plain message", nOpt > 0 || /No solution|Cannot evaluate|Search limit|Nothing/.test(resText), resText.slice(0, 200));
check("Search wider is offered with the day-off caveat", await insp.getByRole("button", { name: "Search wider" }).isVisible() && /day off to take extra shifts/.test(resText));
await page.screenshot({ path: shot });
if (nOpt > 0) {
  check("options are explained in words", /Changes \w+ (person|people)/.test(resText) && /Drive \d+ min/.test(resText));
  await insp.getByRole("button", { name: /^Preview/ }).first().click(); await settle();
  check("Preview opens a proposal", await get(() => !!window.__v3.app.getState().world.session.proposal));
  check("Inspector says to accept or discard first", /Accept or discard the preview first/.test(await insp.innerText()));
  check("Place buttons are disabled while previewing", (await insp.locator('button[aria-label^="Place: "]:not([disabled]), button[aria-label^="Move here: "]:not([disabled])').count()) === 0);
  check("steppers and Find cover are disabled while previewing", await insp.getByRole("button", { name: "More: Accept being short" }).isDisabled() && await insp.getByRole("button", { name: "Find cover" }).isDisabled());
  await get(() => window.__v3.app.getState().discardProposal()); await settle();
  check("controls come back after discarding", await insp.getByRole("button", { name: "Find cover" }).isEnabled());
} else check("(no options to preview)", false);
await insp.getByRole("button", { name: "Clear these results" }).click(); await settle();

// 8. pharmacist day
const ph = await get(() => {
  const s = window.__v3.app.getState();
  const st = s.world.state;
  const u = Object.values(st.unavailability)[0];
  return { id: u.pharmacistId, date: u.first, uid: u.id, status: u.status };
});
await select({ pharmacistId: ph.id, date: ph.date });
const txt = await insp.innerText();
check("pharmacist day shows where they are", (await insp.getByTestId("pharmacist-where").count()) === 1);
check("pharmacist day lists time off", /Time off covering this day/i.test(txt) && /(Vacation|Sick|Other|Turned down)/.test(txt));
check("pharmacist day offers stores", (await insp.locator('ul[aria-label="Stores where they could work"] > li').count()) > 0);
await commit([{ t: "unavail.update", id: ph.uid, patch: { status: "Requested" } }]); await settle();
await insp.getByRole("button", { name: "Approve" }).first().click(); await settle();
check("Approve records the decision", (await get((id) => window.__v3.app.getState().world.state.unavailability[id].status, ph.uid)) === "Approved");
await insp.getByRole("button", { name: "Open store day" }).first().count().then(async (n) => { if (n) { await insp.getByRole("button", { name: "Open store day" }).first().click(); await settle(); check("Open store day switches to the store", await insp.getByTestId("cell-status").isVisible()); } });

// 9. no horizontal scroll in the panel
check("Inspector does not scroll sideways", await get(() => { const el = document.querySelector('aside[aria-label="Inspector"]'); return el.scrollWidth <= el.clientWidth; }));
check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
srv.close();
if (failed()) { console.log(`${failed()} check(s) failed`); process.exit(1); }
console.log("all inspector checks passed; screenshot:", shot);
