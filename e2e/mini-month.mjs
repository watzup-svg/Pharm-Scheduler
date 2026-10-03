// The small month in the Holidays header (Time off keeps its one month in the page body): a day's mark sits behind its own date and never spills onto
// another day, at laptop and phone sizes.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  for (const width of [1366, 390, 320]) {
    for (const route of ["holidays"]) {
      const { page } = await open(browser, route, { width, height: 844 });
      const bad = await page.evaluate(() => {
        const days = [...document.querySelectorAll("section.bg-night [role=group] button[data-day]")];
        const boxes = days.map((b) => ({ d: b.dataset.day, cell: b.getBoundingClientRect(), mark: b.querySelector("[data-mark]")?.getBoundingClientRect() ?? null, num: b.querySelector("span:last-child").getBoundingClientRect() }));
        const out = [];
        for (const a of boxes) {
          if (!a.mark) continue;
          // The date is inside its own mark.
          if (a.num.left < a.mark.left - 0.5 || a.num.right > a.mark.right + 0.5 || a.num.top < a.mark.top - 0.5 || a.num.bottom > a.mark.bottom + 0.5) out.push(`${a.d}: date outside its mark`);
          // The mark covers no other day's date.
          for (const b of boxes) if (b !== a && a.mark.left < b.num.right && a.mark.right > b.num.left && a.mark.top < b.num.bottom && a.mark.bottom > b.num.top) out.push(`${a.d} covers ${b.d}`);
        }
        return { n: boxes.filter((b) => b.mark).length, out };
      });
      check(`small month marks never cover a date /${route} @${width}`, bad.out.length === 0, bad.out.slice(0, 3).join("; "));
      await page.close();
    }
  }
  await browser.close();
}
