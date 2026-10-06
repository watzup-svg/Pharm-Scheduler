// One window edits at a time: a second window waits behind "Take over here"; taking over moves the schedule and keeps the other window's work.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
const b = await launch();
const s = await serveV3();
const ctx = await b.newContext();

const a = await openApp(b, s.base, { practice: true, context: ctx });
check("first window is the editing window", (await a.page.evaluate(() => window.__bootResult)) !== "other-window");
await a.page.evaluate(() => window.__v3.loadPractice());

const second = await ctx.newPage();
await second.goto(s.base, { waitUntil: "load" });
await second.waitForFunction(() => window.__v3);
await second.waitForSelector("h1");
const h1 = await second.textContent("h1");
check("second window says it is open elsewhere", /open in another window/i.test(h1), h1);
check("second window did not load a schedule", (await second.evaluate(() => !window.__v3.app.getState().world)));
check("second window offers Take over here", (await second.getByRole("button", { name: "Take over here" }).count()) === 1);
check("second window never touched the browser copy", (await second.evaluate(() => window.__bootResult)) === "other-window");

// Take over: the first window is told and flushes; the second reloads and becomes the editing window.
await second.getByRole("button", { name: "Take over here" }).click();
await a.page.waitForSelector("h1:has-text('Another window took over')", { timeout: 5000 });
check("first window says another window took over", true);
await second.waitForEvent("load", { timeout: 8000 }).catch(() => {});
await second.waitForFunction(() => window.__v3, null, { timeout: 8000 });
await second.waitForTimeout(500);
check("second window is now the editing window", (await second.evaluate(() => window.__bootResult)) !== "other-window");
check("no console errors", a.errors.length === 0, a.errors.join("|"));

await b.close(); s.close();
process.exit(failed() ? 1 : 0);
