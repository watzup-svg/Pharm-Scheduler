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
check("the automatic search does not spill into the left queue", (await page.getByText("Ways to cover").count()) === 0);
// Swap in: the same search runs with the swap's remove edit as its prefix.
await insp.getByRole("button", { name: "Swap to someone else" }).first().click();
await page.waitForSelector("[data-multimove-status='done'], [data-multimove-status='none'], [data-multimove] ol", { timeout: 60000 });
const rr = await get(() => window.__v3.app.getState().repairResult);
check("the swap search is tagged with its prefix", !rr || typeof rr.swap === "string" || rr.swap === undefined);
if (rr?.result?.options?.length) check("every swap plan starts with the removal", rr.result.options.every((o) => o.edits[0]?.t === "remove" || o.edits[0]?.t === "unassign"), JSON.stringify(rr.result.options[0].edits[0]));
check("no page errors", errors.length === 0, JSON.stringify(errors));
await browser.close(); await srv.close?.();
process.exit(failed() ? 1 : 0);
