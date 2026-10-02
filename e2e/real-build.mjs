// The copy for real use (`npm run build:real`, served from dist-real/ on :3003). It must start like a fresh install:
// the Welcome screen, no invented practice month, the browser's own confirm(), and no "Sample" marker once she starts.
//   REAL_BASE  where it is served (default http://127.0.0.1:3003/spa.html)
import { check, failed, launch } from "./lib.mjs";

const REAL = process.env.REAL_BASE ?? "http://127.0.0.1:3003/spa.html";

const browser = await launch();
for (const width of [1366, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(REAL, { waitUntil: "load" });
  await page.waitForTimeout(900);
  const welcome = page.getByRole("dialog", { name: "Start a schedule" });
  check(`a first visit shows the Welcome screen @${width}`, await welcome.isVisible());
  check(`the practice month is not loaded @${width}`, !(await page.locator("body").innerText()).includes("Marisol"));
  check(`confirm() is the browser's own @${width}`, await page.evaluate(() => /native code/.test(String(window.confirm))));
  await welcome.getByRole("button", { name: /Set up my stores/ }).click();
  await page.waitForTimeout(900);
  check(`after "Set up my stores" nothing says Sample @${width}`, (await page.getByText("Sample", { exact: true }).count()) === 0);
  check(`no script errors @${width}`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await browser.close();
console.log(failed() ? `\n${failed()} check(s) failed` : "\nall checks passed");
process.exit(failed() ? 1 : 0);
