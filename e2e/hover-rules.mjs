// One hover note per spot: no note inside another note, no title beside a note, notes within their length, and a plain
// control never borrows its card's note.
import { check, launch, open } from "./lib.mjs";

const audit = () => {
  const SEL = "[data-tip],[title]";
  const bad = { nested: [], both: [], long: [], inherit: [] };
  const INTERACTIVE = "button,a,[role='button'],[role='gridcell'],[role='tab'],[role='menuitem'],input,select,textarea,summary";
  for (const e of document.querySelectorAll(SEL)) {
    if (e.closest("[data-notip]")) continue;
    const tip = e.getAttribute("data-tip") ?? e.getAttribute("title") ?? "";
    const where = `${e.tagName.toLowerCase()}: ${tip.slice(0, 40)}`;
    const anc = e.parentElement?.closest(SEL);
    if (anc && !anc.closest("[data-notip]")) bad.nested.push(`${where} ⊂ ${(anc.getAttribute("data-tip") ?? anc.getAttribute("title") ?? "").slice(0, 30)}`);
    if (e.hasAttribute("data-tip") && e.hasAttribute("title")) bad.both.push(where);
    const lines = tip.split("|").length;
    if (tip.length > 260 || lines > 4) bad.long.push(`${where} (${tip.length} chars, ${lines} lines)`);
  }
  // a control without a note, sitting inside something that has one
  for (const c of document.querySelectorAll(INTERACTIVE)) {
    if (c.closest("[data-notip]") || c.matches(SEL) || c.disabled) continue;
    const anc = c.parentElement?.closest(SEL);
    if (anc && !anc.closest("[data-notip]")) bad.inherit.push(`${c.tagName.toLowerCase()} "${(c.getAttribute("aria-label") || c.textContent || "").trim().slice(0, 24)}" in ${(anc.getAttribute("data-tip") ?? anc.getAttribute("title") ?? "").slice(0, 30)}`);
  }
  return bad;
};

export default async function run() {
  const browser = await launch();
  const pages = ["", "schedule", "time-off", "people", "stores", "print", "holidays", "lists"];
  for (const width of [1366, 390]) {
    for (const route of pages) {
      const { page } = await open(browser, route, { width, height: 900 });
      const bad = await page.evaluate(audit);
      const label = `/${route || "district"} @${width}`;
      check(`no note inside another note ${label}`, !bad.nested.length, bad.nested.slice(0, 2).join(" | "));
      check(`no title beside a note ${label}`, !bad.both.length, bad.both.slice(0, 2).join(" | "));
      check(`notes stay within their length ${label}`, !bad.long.length, bad.long.slice(0, 2).join(" | "));
      check(`a plain control does not sit under a card's note ${label}`, !bad.inherit.length, bad.inherit.slice(0, 2).join(" | "));
      await page.close();
    }
  }
  // Pointing behaves: a plain control shows nothing of its card's, and moving between areas never leaves two notes up.
  {
    const cards = (p) => p.evaluate(() => [...document.querySelectorAll('div.fixed.z-\\[60\\]')].filter((e) => e.textContent.trim()).length);
    let { page } = await open(browser, "stores");
    await page.getByRole("button", { name: /^Letters/ }).hover();
    await page.waitForTimeout(250);
    check("a plain button shows no borrowed note", (await cards(page)) === 0);
    await page.close();
    ({ page } = await open(browser, ""));
    await page.locator('[role="columnheader"]').nth(8).hover();
    await page.waitForTimeout(200);
    check("a column header shows one note", (await cards(page)) === 1);
    await page.locator('[data-rc="3|8"]').hover();
    await page.waitForTimeout(300);
    check("moving onto a grid cell leaves exactly one note", (await cards(page)) === 1);
    await page.getByRole("button", { name: /^Fill/ }).first().hover();
    await page.waitForTimeout(250);
    check("moving off to a plain button clears them", (await cards(page)) === 0);
    await page.close();
  }
  // The panels and dialogs
  for (const width of [1366, 390]) {
    const { page } = await open(browser, "schedule", { width, height: 900 });
    await page.getByRole("button", { name: /Show the first/ }).first().click();
    await page.waitForTimeout(400);
    let bad = await page.evaluate(audit);
    check(`the day panel has one note per spot @${width}`, !Object.values(bad).flat().length, Object.values(bad).flat().slice(0, 2).join(" | "));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Someone called in sick" }).first().click();
    await page.waitForTimeout(400);
    bad = await page.evaluate(audit);
    check(`the Mark out dialog has one note per spot @${width}`, !Object.values(bad).flat().length, Object.values(bad).flat().slice(0, 2).join(" | "));
    await page.close();
    const t = await open(browser, "time-off", { width, height: 900 });
    await t.page.getByRole("button", { name: "Add time off", exact: true }).first().click();
    await t.page.waitForTimeout(400);
    bad = await t.page.evaluate(audit);
    check(`the Add time off dialog has one note per spot @${width}`, !Object.values(bad).flat().length, Object.values(bad).flat().slice(0, 2).join(" | "));
    await t.page.close();
  }
  await browser.close();
}
