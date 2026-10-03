// Shorter drives: the card appears where it helps, "Use this plan" fixes the shift as one step, and undo puts everything back.
import fs from "node:fs";
import { axeSource, BASE, check, launch } from "./lib.mjs";

const fixture = fs.readFileSync(new URL("./fixtures/cover-doc.json", import.meta.url), "utf8");

export default async function run() {
  const browser = await launch();
  const axe = axeSource();
  for (const size of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const tag = `@${size.width}`;
    const ctx = await browser.newContext({ viewport: size });
    await ctx.addInitScript((r) => { localStorage.setItem("hischool-trial-demo-v1", "1"); localStorage.setItem("hischool-schedule-autosave-v3", r); }, fixture);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}#/schedule`, { waitUntil: "load" });
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: /Show the first/ }).first().click();
    await page.waitForTimeout(400);
    const dlg = page.getByRole("dialog");
    let found = false;
    for (let i = 0; i < 14 && !found; i++) {
      const card = dlg.getByRole("region", { name: "Shorter drives" });
      // A plan that leaves another store bare is shown too (checked below); this part wants one that fixes the shift outright.
      if ((await card.count()) && !(await card.locator("li").filter({ hasText: "Use this plan" }).first().innerText().then((t) => /with no pharmacist/.test(t)))) { found = true; break; }
      const next = dlg.getByRole("button", { name: /^Next ·/ });
      if (!(await next.count())) break;
      await next.click();
      await page.waitForTimeout(250);
    }
    check(`shorter drives card shows when only a second pharmacist can cover ${tag}`, found);
    if (!found) { await ctx.close(); continue; }
    const pv = (await dlg.getByTestId("plan-preview").first().innerText()).replace(/\s+/g, " ");
    const nums = pv.match(/this month (\d+) → (\d+)/);
    check(`the first plan shows a preview that the month has one fewer empty shift ${tag}`, Boolean(nums) && Number(nums[1]) - Number(nums[2]) === 1, pv);
    await page.evaluate(axe);
    const bad = await page.evaluate(async () => (await axe.run(document.querySelector('[role="dialog"]'), { resultTypes: ["violations"] })).violations.flatMap((x) => x.nodes.map((n) => `${x.id}:${n.target.join(" ").slice(0, 50)}`)));
    check(`shorter drives card passes the accessibility scan ${tag}`, !bad.length, bad.slice(0, 2).join("; "));
    const before = await page.evaluate(() => document.title + "|" + (document.querySelector('[aria-label*="to fix"]')?.getAttribute("aria-label") ?? ""));
    await dlg.getByRole("button", { name: "Use this plan" }).first().click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.title + "|" + (document.querySelector('[aria-label*="to fix"]')?.getAttribute("aria-label") ?? ""));
    check(`using a plan fixes the shift (one fewer to fix) ${tag}`, Number(before.match(/(\d+) to fix/)?.[1]) - Number(after.match(/(\d+) to fix/)?.[1] ?? 0) === 1, `${before} → ${after}`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);
    const undone = await page.evaluate(() => document.title + "|" + (document.querySelector('[aria-label*="to fix"]')?.getAttribute("aria-label") ?? ""));
    check(`undo restores it exactly ${tag}`, undone === before, `${before} vs ${undone}`);
    check(`no page errors ${tag}`, errors.length === 0, errors[0]);
    await ctx.close();
  }
  await browser.close();
}
