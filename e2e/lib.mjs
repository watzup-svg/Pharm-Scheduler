// Shared bits for the browser checks. Needs `playwright-core` and `axe-core` (devDependencies) and a Chromium.
//   BASE   where the built app is served (default http://127.0.0.1:3002/spa.html, from `vite build -c vite.spa.config.ts`)
//   CHROME path to Chromium (default: Playwright's pre-installed one)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export const BASE = process.env.BASE ?? "http://127.0.0.1:3002/spa.html";
export const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
export const axeSource = () => fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export async function launch() {
  // BROWSER=webkit runs the same checks in Playwright's WebKit (the Safari engine). Chromium stays the default.
  if (process.env.BROWSER === "webkit") return require("playwright-core").webkit.launch();
  const { chromium } = require("playwright-core");
  return chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
}

// Resolves once every finite CSS animation has ended (panels slide and fade in over ~200ms). Measuring or scanning mid-animation sees a half-transparent, shifted panel; a fixed wait raced it on a loaded WebKit runner.
export const settled = (page) => page.evaluate(() => Promise.race([
  Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
  new Promise((done) => setTimeout(done, 5000)),
]));

export async function open(browser, route, size = { width: 1366, height: 900 }) {
  const page = await browser.newPage({ viewport: size });
  // A real print dialog can crash headless Chromium on some machines (it did on the CI runner); the tests only need the app to ask.
  await page.addInitScript(() => { window.print = () => {}; });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}#/${route}`, { waitUntil: "load" });
  await page.waitForTimeout(900);
  return { page, errors };
}

let failures = 0;
export function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
export const failed = () => failures;

/** Open a note: notes open on right click (hover only draws a small marker). */
export async function rightClick(locator, options = {}) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ button: "right", ...options });
  await locator.page().waitForTimeout(250);
}

/** Press and hold a HoldButton long enough to fire it. */
export async function hold(page, locator, ms = 1100) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** A scratch file path private to this run, so two runs at the same time never write the same file. */
let scratch = process.env.E2E_TMP;
export function tmp(name) {
  scratch ??= fs.mkdtempSync(path.join(os.tmpdir(), "hischool-e2e-"));
  return path.join(scratch, name);
}
