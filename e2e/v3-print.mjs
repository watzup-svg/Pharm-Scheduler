// Post and print, end to end, in the built v3 app. Build first: npm run build:v3
//   node e2e/v3-print.mjs
// Screenshots and the downloaded PDF go to SHOTS (default: a folder next to this file's temp output).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check, failed, launch, openApp, serveV3 } from "./v3-lib.mjs";

const OUT = process.env.SHOTS ?? fs.mkdtempSync(path.join(os.tmpdir(), "v3-print-"));
fs.mkdirSync(OUT, { recursive: true });

const srv = await serveV3();
const browser = await launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 800 } });
const { page, errors } = await openApp(browser, srv.base, { context: ctx });

// Same month as the practice file, whatever today is.
await page.evaluate(() => {
  const app = window.__v3.app.getState();
  app.setWindow("2026-10-01", "2026-10-31");
  app.setAsOf("2026-10-06");
  app.setView("print");
});
await page.waitForSelector("[data-print-view]");

// 1. Before posting: the warnings that would be on the snapshot, in words, and posting is not blocked.
check("nothing posted yet", (await page.locator("[data-snapshots]").count()) === 0);
const line = (await page.locator("[data-confirm-line]").innerText()).trim();
console.log("     confirm line:", line);
check("confirm line says what would be posted", /Posting with .*open shift/.test(line) && /empty box/.test(line), line);
const postBtn = page.locator("[data-post]");
check("button says Post anyway", /Post anyway/.test(await postBtn.innerText()));
check("button enabled", await postBtn.isEnabled());

// 2. Post revision 1.
await postBtn.click();
await page.waitForSelector("[data-revision='1']");
const rev1 = (await page.locator("[data-revision='1']").innerText()).replace(/\s+/g, " ");
console.log("     rev 1 row:", rev1);
check("revision 1 listed with period and warnings", /Revision 1/.test(rev1) && /October 2026/.test(rev1) && /open shift/.test(rev1) && /problem/.test(rev1), rev1);
const snap1 = await page.evaluate(() => window.__v3.app.getState().world.journal.snapshots[0].warnings);
check("snapshot warnings match what the row says", rev1.includes(`${snap1.open} open shift`), JSON.stringify(snap1));
check("nothing changed yet", /Nothing has changed/.test(await page.locator("[data-changes]").innerText()));

const model1 = await page.evaluate(() => JSON.stringify(window.__v3print.modelFor(1)));
const pdf1 = await page.evaluate(() => window.__v3print.pdfHash(1));
check("model has stores and sheets", JSON.parse(model1).stores.length >= 10, `${JSON.parse(model1).stores.length} stores`);

// 3. Change a cell: remove one placed pharmacist inside the posted range.
const changed = await page.evaluate(() => {
  const app = window.__v3.app.getState();
  const a = Object.values(app.world.state.assignments).filter((x) => x.date >= "2026-10-06" && x.date <= "2026-10-31").sort((x, y) => (x.date + x.id < y.date + y.id ? -1 : 1))[0];
  const who = app.world.state.pharmacists[a.pharmacistId].name;
  const ok = app.commit([{ t: "remove", assignmentId: a.id }], "e2e change");
  return { ok, date: a.date, who };
});
check("the change went through", changed.ok);
await page.waitForTimeout(150);
const chg = (await page.locator("[data-changes]").innerText()).replace(/\s+/g, " ");
console.log("     changed:", chg);
check("Changed since posting lists it", /Changed since posting/.test(chg) && chg.includes(changed.who) && /was .+, now off/.test(chg), chg);

// 4. Post revision 2 from the same section.
await page.locator("[data-post-new]").click();
await page.waitForSelector("[data-revision='2']");
check("two revisions, newest first", (await page.locator("[data-snapshots] li").first().getAttribute("data-revision")) === "2");
check("after posting, nothing has changed", /Nothing has changed/.test(await page.locator("[data-changes]").innerText()));

// 5. Reprint revision 1 after the change: identical to the first print.
const model1b = await page.evaluate(() => JSON.stringify(window.__v3print.modelFor(1)));
const pdf1b = await page.evaluate(() => window.__v3print.pdfHash(1));
check("revision 1 model is identical after the live schedule changed", model1 === model1b);
check("revision 1 PDF bytes are identical", pdf1 === pdf1b, `${pdf1} vs ${pdf1b}`);
const model2 = await page.evaluate(() => JSON.stringify(window.__v3print.modelFor(2)));
check("revision 2 differs from revision 1", model2 !== model1);

// 6. Download revision 1's PDF.
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF of revision 1" }).click()]);
const file = path.join(OUT, dl.suggestedFilename());
await dl.saveAs(file);
const bytes = fs.readFileSync(file);
check("download name", dl.suggestedFilename() === "HiSchool_2026-10_rev1.pdf", dl.suggestedFilename());
check("download is a PDF", bytes.subarray(0, 5).toString("latin1") === "%PDF-" && bytes.length > 5000, `${bytes.length} bytes`);
await page.waitForTimeout(100);
const last = await page.evaluate(() => window.__v3print.lastPdf);
check("blob is non-empty and starts with %PDF", !!last && last.size > 5000 && last.head.startsWith("%PDF"), JSON.stringify(last));
console.log("     pdf:", file);

// 7. Options change the packet; the preview follows.
const count = async () => Number((/of (\d+)/.exec(await page.locator("[data-sheet-count]").innerText()) ?? [])[1]);
const base = await count();
await page.getByLabel("Two stores per sheet").check();
const two = await count();
check("two per sheet halves the store sheets", two < base && two >= Math.ceil((base - 1) / 2), `${base} -> ${two}`);
await page.getByLabel("Two stores per sheet").uncheck();
await page.getByLabel("All stores at a glance").uncheck();
check("glance page is optional", (await count()) === base - 1);
await page.getByLabel("All stores at a glance").check();
await page.getByLabel("Paper").selectOption("tabloid");
check("tabloid sheet is 11 x 17 in", await page.evaluate(() => { const r = document.querySelector("[data-preview] .print-sheet").getBoundingClientRect(); return Math.abs(r.height / r.width - 17 / 11) < 0.01; }));
await page.getByLabel("Paper").selectOption("letter");

// 8. Ctrl+P: in print media only the packet shows, every sheet, at paper size.
await page.emulateMedia({ media: "print" });
const pr = await page.evaluate(() => ({
  appHidden: getComputedStyle(document.getElementById("root")).display === "none",
  sheets: document.querySelectorAll(".v3-print-root .print-sheet").length,
  shown: getComputedStyle(document.querySelector(".v3-print-root")).display,
}));
check("print media shows only the packet", pr.appHidden && pr.shown === "block" && pr.sheets === base, JSON.stringify(pr));
const printed = await page.pdf({ preferCSSPageSize: true });
const pages = (printed.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
check("browser print makes one page per sheet", pages === base, `${pages} pages vs ${base} sheets`);
fs.writeFileSync(path.join(OUT, "browser-print.pdf"), printed);
await page.emulateMedia({ media: "screen" });

// 9. Screenshots: the view, and the preview.
await page.evaluate(() => document.querySelector("main").scrollTo(0, 0));
await page.screenshot({ path: path.join(OUT, "print-view-top.png") });
await page.evaluate(() => document.querySelector("[data-preview]").scrollIntoView({ block: "start" }));
await page.screenshot({ path: path.join(OUT, "print-view-preview.png") });
// A store sheet, not just the glance page.
await page.getByRole("button", { name: "Next sheet" }).click();
await page.evaluate(() => document.querySelector("[data-preview]").scrollIntoView({ block: "start" }));
await page.screenshot({ path: path.join(OUT, "print-view-store.png") });

check("no script errors", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(`     files in ${OUT}`);
await browser.close();
srv.close();
process.exit(failed() ? 1 : 0);
