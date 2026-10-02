// A phone-sized, touch-only visit on a slow processor (4x throttled where the browser allows it): every page loads without errors or
// sideways scroll, shows its header in a few seconds, and a day opens with two taps (first tap shows the note, second opens it).
// This is still a desktop browser pretending to be a phone: real iPhone Safari and real fingers stay unchecked.
import { BASE, check, launch } from "./lib.mjs";

const ROUTES = ["", "schedule", "time-off", "print", "people", "stores", "holidays"];

export default async function run() {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${route || "home"}: ${e.message}`));
    await page.addInitScript(() => { window.print = () => {}; });
    let throttled = false;
    try {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      throttled = true;
    } catch { /* not Chromium: run at full speed */ }
    const t0 = Date.now();
    await page.goto(`${BASE}#/${route}`, { waitUntil: "load" });
    await page.locator("header").first().waitFor({ timeout: 8000 });
    const ms = Date.now() - t0;
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`phone /${route}: header up in ${ms} ms${throttled ? " (4x slow)" : ""}`, ms < 6000, `${ms} ms`);
    check(`phone /${route}: no sideways scroll`, over <= 1, `${over}px wider than the screen`);
    await page.close();
  }
  const page = await ctx.newPage();
  await page.goto(`${BASE}#/`, { waitUntil: "load" });
  await page.waitForTimeout(900);
  const cell = page.locator('[data-rc="3|8"]');
  await cell.scrollIntoViewIfNeeded();
  await cell.tap();
  await page.waitForTimeout(300);
  check("phone: first tap on a day tile does not navigate", !/schedule/.test(page.url()), page.url());
  await cell.tap();
  await page.waitForTimeout(700);
  check("phone: second tap opens the day", /schedule/.test(page.url()), page.url());
  check("phone: no script errors", errors.length === 0, errors.join(" | "));
  await browser.close();
}
