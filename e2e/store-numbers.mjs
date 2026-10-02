// Naming stores by number: after the switch on the Stores page, no page shows a store's letters, in text or in a hover
// note, except the Stores table's own Letters column. Covering tags with a four-digit number still fit a phone cell.
import { check, launch, open } from "./lib.mjs";

const PAGES = ["", "schedule", "time-off", "people", "holidays", "lists", "print"];

export default async function run() {
  const browser = await launch();
  for (const size of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const { page, errors } = await open(browser, "stores", size);
    const codes = await page.evaluate(() => [...document.querySelectorAll("table td.font-medium")].map((t) => t.textContent.trim()).filter((t) => /^[A-Z]{2,4}$/.test(t)));
    await page.getByRole("radio", { name: /Store number/ }).or(page.getByRole("button", { name: /Store number/ })).first().click();
    const re = `\\b(${codes.join("|")})\\b`;
    for (const r of PAGES) {
      await page.evaluate((r) => (location.hash = `#/${r}`), r);
      await page.waitForTimeout(700);
      const hits = await page.evaluate((src) => {
        const re = new RegExp(src);
        const out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const el = w.currentNode.parentElement;
          if (!el || el.closest("script,style") || (el.offsetParent === null && getComputedStyle(el).position !== "fixed")) continue;
          if (re.test(w.currentNode.textContent)) out.push(w.currentNode.textContent.trim().slice(0, 40));
        }
        for (const el of document.querySelectorAll("[data-tip],[aria-label]")) for (const a of ["data-tip", "aria-label"]) { const v = el.getAttribute(a); if (v && re.test(v)) out.push(v.slice(0, 40)); }
        return out;
      }, re);
      check(`${size.width}px /${r || "district"}: no store letters with numbers chosen`, hits.length === 0, hits.slice(0, 3).join(" ; "));
    }
    if (size.width === 390) {
      await page.evaluate(() => (location.hash = "#/schedule"));
      await page.waitForTimeout(700);
      const spill = await page.evaluate(() => [...document.querySelectorAll("[data-tip^='Covering | Home store']")].filter((e) => e.offsetParent && e.parentElement.scrollWidth > e.parentElement.clientWidth).length);
      check("a covering tag with a store number fits its phone cell", spill === 0, `${spill} spill`);
    }
    check(`${size.width}px: no page errors`, errors.length === 0, errors.join(" ; "));
    await page.close();
  }
  await browser.close();
}
