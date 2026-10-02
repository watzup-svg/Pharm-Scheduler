// `npm run guards`: quick promises about the build itself. Needs the builds (npm run build:trial, build:real).
//   size     each built file is under its budget (scripts/budgets.json)
//   hosts    the web addresses written inside the build are all on scripts/allowed-hosts.txt (library comments and XML names)
//   offline  opening every page, a day popup and the print page makes no request except to the page itself
//   docs     a source file added since the base branch is named in ARCHITECTURE.md; a src change with no WHATS_NEW line is noted
// Prints one line per guard; a failure shows what and where. Nothing here uses the network.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const say = (ok, name, detail = "") => { if (!ok) failures += 1; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// size
const budgets = JSON.parse(read("scripts/budgets.json"));
for (const [file, max] of Object.entries(budgets)) {
  if (file === "note") continue;
  if (!fs.existsSync(path.join(root, file))) { say(false, `size ${file}`, "missing: build it first"); continue; }
  const size = fs.statSync(path.join(root, file)).size;
  say(size <= max, `size ${file}`, `${(size / 1e6).toFixed(2)} MB of ${(max / 1e6).toFixed(2)} MB allowed`);
}

// hosts
if (fs.existsSync(path.join(root, "dist-spa/spa.html"))) {
  const allowed = new Set(read("scripts/allowed-hosts.txt").split("\n").map((l) => l.trim()).filter(Boolean));
  for (const file of ["dist-spa/spa.html", "dist-real/spa.html"]) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const hosts = new Set([...read(file).matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)].map((m) => m[1]));
    const unknown = [...hosts].filter((h) => !allowed.has(h));
    say(!unknown.length, `hosts ${file}`, unknown.length ? `new address(es): ${unknown.join(", ")}` : `${hosts.size} known`);
  }
}

// offline
if (fs.existsSync(path.join(root, "dist-spa/spa.html"))) {
  const { createRequire } = await import("node:module");
  const { chromium } = createRequire(import.meta.url)("playwright-core");
  const s = await serve();
  const origin = new URL(s.base).origin;
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const outside = new Set();
  let opened = 0;
  for (const size of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: size });
    ctx.on("request", (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) outside.add(u.slice(0, 80)); });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.print = () => {}; });
    page.on("websocket", (w) => outside.add(`websocket ${w.url()}`));
    for (const route of ["", "schedule", "time-off", "people", "stores", "holidays", "lists", "print"]) {
      await page.goto(`${s.base}#/${route}`);
      await page.waitForTimeout(500);
      opened += 1;
      if (route === "schedule") {
        await page.locator("[id^='day-']").first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(250);
        await page.keyboard.press("Escape");
      }
    }
    await ctx.close();
  }
  await browser.close();
  s.close();
  say(outside.size === 0, "offline: no request leaves the page", outside.size ? [...outside].slice(0, 3).join(" ; ") : `${opened} page loads`);
}

// docs
try {
  const base = ["origin/main", "main"].find((b) => { try { execSync(`git rev-parse --verify -q ${b}`, { cwd: root, stdio: "ignore" }); return true; } catch { return false; } });
  if (!base) throw new Error("no base branch to compare with");
  const run = (c) => execSync(c, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const added = run(`git diff --name-only --diff-filter=A ${base}...HEAD -- src`).filter((f) => /^src\/(components|lib\/schedule)\/[^/]+\.(ts|tsx)$/.test(f) && !/\.test\.|\.d\.ts$/.test(f));
  const arch = read("ARCHITECTURE.md");
  const missing = added.filter((f) => !arch.includes(path.basename(f)) && !arch.includes(path.basename(f).replace(/\.tsx?$/, "")));
  say(!missing.length, "docs: new source files are named in ARCHITECTURE.md", missing.length ? `not named: ${missing.join(", ")}` : `${added.length} new`);
  const changed = run(`git diff --name-only ${base}...HEAD`);
  if (changed.some((f) => f.startsWith("src/")) && !changed.includes("docs/WHATS_NEW.md")) console.log("note  src changed but docs/WHATS_NEW.md did not (not a failure)");
} catch (e) {
  console.log(`skip  docs: ${String(e.message).split("\n")[0]}`);
}
process.exit(failures ? 1 : 0);
