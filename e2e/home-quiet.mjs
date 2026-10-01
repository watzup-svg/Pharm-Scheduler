// The home screen in the sample month shows the problems as marks and numbers, with no sentence on screen.
import { launch, open, check, failed } from "./lib.mjs";
const b = await launch();
for (const size of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  const { page, errors } = await open(b, "", size);
  const sentences = await page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const e = n.parentElement;
      if (!e || e.closest("script,style,[aria-hidden=true],.sr-only,details:not([open])")) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const s = n.textContent.replace(/\s+/g, " ").trim();
      if (s.split(" ").length >= 4) out.push(s);
    }
    return out;
  });
  check(`@${size.width} no sentence on the home screen`, sentences.length === 0, sentences.slice(0, 3).join(" | "));
  const numeral = Number((await page.locator('section[aria-label="Month status"] button').first().innerText()).trim());
  check(`@${size.width} the count of hard problems is shown`, numeral > 0, String(numeral));
  const kinds = await page.locator('section[aria-label="Month status"] ul[aria-label="Problems by kind"] button').count();
  check(`@${size.width} problems are split by kind with marks`, kinds >= 2, String(kinds));
  check(`@${size.width} no errors`, errors.length === 0, errors.join());
  await page.close();
}
await b.close();
process.exit(failed() ? 1 : 0);
