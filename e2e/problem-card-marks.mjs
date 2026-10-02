// Every red problem card in the day panel carries its kind's mark (door, empty chair, twice, licence), the same one as the tiles.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  const { page, errors } = await open(browser, "schedule");
  await page.locator("#day-WAL-14").click();
  await page.waitForTimeout(300);
  const card = page.locator('[role="status"][class*="bg-illegal-bg"]').first();
  const kinds = new Set();
  for (let i = 0; i < 40; i++) {
    const found = await card.locator("[data-statemark]").evaluateAll((els) => els.map((e) => e.getAttribute("data-statemark")));
    found.forEach((k) => kinds.add(k));
    if (i === 0) {
      check("a no-coverage card shows the hole mark", found.includes("hole"), found.join());
      await page.screenshot({ path: "/tmp/problem-card-hole.png" });
    }
    const next = page.getByRole("dialog").getByRole("button", { name: /^Next/ });
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(120);
  }
  check("the other problem kinds carry their marks too", ["hole", "leftover"].every((k) => kinds.has(k)), [...kinds].join());
  check("no script errors", errors.length === 0, errors.join(" | "));
  await browser.close();
}
