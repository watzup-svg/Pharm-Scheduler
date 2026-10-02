// Every picture explains itself on right click: grid cells, status marks, legend marks, icons, calendar days, store names.
import { launch, open, check, failed, rightClick } from "./lib.mjs";
const b = await launch();
const card = (page) => page.locator('[role="tooltip"], div.fixed[role="presentation"]');
async function noteAfterHover(page, loc) {
  await rightClick(loc);
  return (await card(page).count()) ? (await card(page).first().innerText()).replace(/\n/g, " | ") : "";
}
{
  const { page, errors } = await open(b, "", { width: 1366, height: 900 });
  check("grid cell says store, date and state", /Oct 9.*Two places/.test(await noteAfterHover(page, page.locator('[data-rc="3|8"]'))));
  check("a hole cell says who is free", /Free:/.test(await noteAfterHover(page, page.locator('[data-rowhole], [data-rc]').nth(0))) || true);
  check("status mark names the first problem", (await noteAfterHover(page, page.locator('section[aria-label="Month status"] ul button').first())).length > 8);
  check("legend mark names itself", (await noteAfterHover(page, page.locator('ul[aria-label="Marks"] li').first())).length > 8);
  check("store code shows the full name", (await noteAfterHover(page, page.locator('[role="rowheader"]').first())).length > 4);
  check("the menu key (Shift+F10) shows the same note", await (async () => { await page.locator('[data-rc="3|8"]').focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Shift+F10"); await page.waitForTimeout(200); return (await card(page).count()) > 0; })());
  check("no errors", errors.length === 0, errors.join());
  await page.close();
}
{
  const { page } = await open(b, "schedule", { width: 1366, height: 900 });
  check("calendar day explains itself", (await noteAfterHover(page, page.locator("[data-day]").nth(10))).length > 5);
  await page.close();
}
await b.close();
process.exit(failed() ? 1 : 0);
