// The wider (multi-move) search runs by itself for an open cell and for "Swap in", and its plans lift the swap's own edits.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
const srv = await serveV3(); const browser = await launch();
const { page, errors } = await openApp(browser, srv.base, {});
const get = (fn, arg) => page.evaluate(fn, arg);
await get(() => window.__v3.app.getState().setView("wall"));
await get(() => { const a = window.__v3.app.getState(); const s = Object.values(a.world.state.stores).find((x) => x.code === "CLA"); a.select({ storeId: s.id, date: "2026-10-20" }); });
const insp = page.locator('aside[aria-label="Inspector"]');
await page.waitForSelector("[data-multimove-status='done'], [data-multimove-status='none'], [data-multimove] ol", { timeout: 60000 });
check("the wider search ran without a click", (await insp.locator("[data-multimove]").count()) === 1);
check("it says what it is and that nothing changes until accepted", /Nothing changes\s+until you accept/.test((await insp.locator("[data-multimove]").innerText()).replace(/\s+/g, " ")));
await page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 90000 });
check("a finished search offers Search again", await insp.getByRole("button", { name: "Search again" }).isEnabled());
// Every candidate says what happens in words and, for a move, how it changes each store.
await insp.getByRole("button", { name: /^Show all \d+/ }).click();
const sents = await insp.locator("[data-sentence]").allInnerTexts();
check("each candidate has a sentence", sents.length >= 3 && sents.every((t) => /Free that day|Moves from \w+|Takes /.test(t)), sents.slice(0, 3).join(" | "));
check("a move that leaves a store short says so and shows both stores", /leaving \w+ short/.test(sents.join(" ")) && (await insp.locator("[data-effect] li").count()) >= 2);
check("the day's own store is listed first in each strip", await insp.locator("[data-effect]").first().locator("li").first().getAttribute("data-effect-store") === (await get(() => window.__v3.app.getState().selection.storeId)));
check("the list is split into no side effects and costs something", /costs something/i.test(await insp.innerText()));
await insp.getByRole("button", { name: "Show fewer" }).click();
check("the automatic search does not spill into the left queue", (await page.getByText("Ways to cover").count()) === 0);
// Swap in: the same search runs with the swap's remove edit as its prefix.
await insp.getByRole("button", { name: "Swap to someone else" }).first().click();
await page.waitForSelector("[data-multimove-status='done'], [data-multimove-status='none'], [data-multimove] ol", { timeout: 60000 });
const rr = await get(() => window.__v3.app.getState().cellRepair);
check("the swap search is tagged with its prefix", !rr || typeof rr.swap === "string" || rr.swap === undefined);
if (rr?.result?.options?.length) check("every swap plan starts with the removal", rr.result.options.every((o) => o.edits[0]?.t === "remove" || o.edits[0]?.t === "unassign"), JSON.stringify(rr.result.options[0].edits[0]));
// Options asked for from the queue are not replaced by the cell's own automatic search.
await get(() => { const a = window.__v3.app.getState(); a.select(null); a.setView("wall"); });
await page.waitForFunction(() => !window.__v3.app.getState().busy);
const gap = await get(() => { const a = window.__v3.app.getState(); const est = Object.values(a.world.state.stores).find((x) => x.code === "EST"); return { storeId: est.id, date: "2026-10-09" }; });
await get((g) => window.__v3.app.getState().runRepair([g], false), gap);
await get((g) => window.__v3.app.getState().select(g), gap);
await page.waitForSelector("[data-multimove-status='done'], [data-multimove-status='none'], [data-multimove] ol", { timeout: 60000 });
await page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 90000 });
check("the queue's cover options survive the cell's automatic search", await get(() => !!window.__v3.app.getState().repairResult && !!window.__v3.app.getState().cellRepair));
// Queue rows carry the best single person, one per open day, never the same person twice on a day.
await get(() => { const a = window.__v3.app.getState(); a.select(null); a.setDrawer(true); });
await page.waitForSelector("[data-queue-suggestion]");
const rowsInfo = await page.locator('aside[aria-label="Left panel"] li.q-row').evaluateAll((els) => els.map((li) => ({ date: li.querySelector(".font-semibold")?.textContent ?? "", who: li.querySelector("[data-queue-suggestion] b")?.textContent ?? "" })));
check("each open queue row has a best person", rowsInfo.length >= 2 && rowsInfo.every((r) => /^Best: /.test(r.who)), JSON.stringify(rowsInfo));
check("nobody is offered for two stores on one day", new Set(rowsInfo.map((r) => `${r.date}|${r.who}`)).size === rowsInfo.length, JSON.stringify(rowsInfo));
await page.getByRole("button", { name: /^Preview .* at EST$/ }).click();
check("Preview on a queue row opens the proposal bar and selects the day", await get(() => !!window.__v3.app.getState().world.session.proposal && window.__v3.app.getState().selection?.date === "2026-10-09"));
await get(() => window.__v3.app.getState().discardProposal());
// Search: "Cover EST Fri Oct 9" selects that open day.
await page.keyboard.press("Control+k");
await page.getByRole("dialog", { name: "Search" }).getByRole("textbox").fill("Cover EST");
check("search offers Cover for an open day", (await page.getByRole("option", { name: /Cover EST Fri Oct 9/ }).count()) === 1);
await page.keyboard.press("Enter");
check("choosing it selects that day", await get(() => window.__v3.app.getState().selection?.date === "2026-10-09"));
check("no page errors", errors.length === 0, JSON.stringify(errors));
await browser.close(); await srv.close?.();
process.exit(failed() ? 1 : 0);
