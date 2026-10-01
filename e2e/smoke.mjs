// Every page at laptop and phone width: no script errors, no sideways page scroll, no accessibility violations.
import { axeSource, check, launch, open } from "./lib.mjs";

const ROUTES = ["", "schedule", "time-off", "holidays", "print", "people", "stores"];
// The faint DRAFT watermark on the print preview is decorative on purpose.
const IGNORE = new Set(["color-contrast:.pointer-events-none"]);

export default async function run() {
  const browser = await launch();
  const axe = axeSource();
  for (const size of [{ width: 1366, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    for (const route of ROUTES) {
      const { page, errors } = await open(browser, route, size);
      await page.evaluate(axe);
      const found = await page.evaluate(async () => (await axe.run(document, { resultTypes: ["violations"] })).violations.flatMap((v) => v.nodes.map((n) => `${v.id}:${n.target.join(" ")}`)));
      const bad = found.filter((f) => !IGNORE.has(f));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      // The header's Save and File buttons must stay on screen at every width.
      const headerOk = await page.evaluate(() => [...document.querySelectorAll("header button")].every((b) => { const r = b.getBoundingClientRect(); return !r.width || r.right <= innerWidth + 1; }));
      check(`/${route} @${size.width}`, !errors.length && !bad.length && !wide && headerOk, [...errors, ...bad.slice(0, 2), wide ? "sideways scroll" : "", headerOk ? "" : "header pushed off screen"].filter(Boolean).join("; "));
      await page.close();
    }
  }
  await browser.close();
}
