// Shared bits for the v3 browser checks. Serves dist-v3/v3.html (build first: npm run build:v3).
//   CHROME path to Chromium (default: Playwright's pre-installed one)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
export async function launch() {
  // BROWSER=firefox|webkit runs the same checks in that engine when Playwright has it installed. Chromium is the default.
  const pw = require("playwright-core");
  const which = process.env.BROWSER;
  if (which === "firefox" || which === "webkit") return pw[which].launch();
  return pw.chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
}

export async function serveV3() {
  const dir = path.join(root, "dist-v3");
  if (!fs.existsSync(path.join(dir, "v3.html"))) throw new Error("Build first: npm run build:v3");
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "") || "v3.html");
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "application/octet-stream" }).end(fs.readFileSync(f));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { base: `http://127.0.0.1:${server.address().port}/v3.html`, close: () => server.close() };
}

/** Opens the app. `practice: true` loads the practice month through the importer. The app opens on the Overview; `view` picks the screen
 * the test starts on ("wall" by default, so tests about the Schedule keep working; pass "overview" for the home screen, or null to leave it). */
export async function openApp(browser, base, { practice = true, size = { width: 1366, height: 800 }, context, view = "wall" } = {}) {
  const page = await (context ?? browser).newPage({ viewport: size });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base, { waitUntil: "load" });
  await page.waitForFunction(() => window.__v3);
  if (practice) { await page.evaluate(() => window.__v3.loadPractice()); await page.waitForTimeout(200); }
  if (practice && view) { await page.evaluate((v) => window.__v3.app.getState().setView(v), view); await page.waitForTimeout(100); }
  return { page, errors };
}

let failures = 0;
export function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
export const failed = () => failures;
