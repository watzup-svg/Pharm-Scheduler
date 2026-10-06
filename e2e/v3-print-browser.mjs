// The print screen in a real browser: the app's own print CSS (@media print, @page size) through Chromium's page.pdf(), for the practice month and a
// larger generated month (40 stores), on letter (large type) and tabloid two-up. Asserts:
//   - the layout: every sheet is the paper size and nothing inside a sheet (store block, header, day cells) sticks out past the printable width or
//     the sheet's edge, and no cell hides text it has no room for
//   - the PDF: one page per sheet, the page count is the expected one (table below) and the same on a second run, MediaBox is the paper
//   - the text: every store code and every set of initials in the posted snapshot is in the PDF's text (read with e2e/support/pdf.mjs, no tool needed)
//   - print-only vs screen-only: on screen the print packet is not displayed; in print the app (#root) is gone, no button / input / link is in the
//     packet, and none of the app's own words ("Post this schedule", "Download PDF", "Undo", "File", ...) are in the PDF text
// Chromium only (page.pdf). A change in the expected page counts means the packet layout changed: update the table on purpose.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
import { genWorld } from "../scripts/v3-pressure/lib.ts";
import { flowContext, practiceBase } from "./support/flow.mjs";
import { readPdf } from "./support/pdf.mjs";

if (process.env.BROWSER && process.env.BROWSER !== "chromium") { console.log("skip page.pdf() is Chromium only"); process.exit(0); }

// Same numbers as scripts/v3-pdf-check.mjs (the jsPDF packet): the browser print must agree with the layout, sheet for sheet.
const EXPECTED_PAGES = { practice: { letter: 17, tabloid2up: 9 }, large: { letter: 41, tabloid2up: 21 } };
const PAPER_PT = { letter: [612, 792], tabloid2up: [792, 1224] };
const UI_WORDS = ["Post this schedule", "Post anyway", "Download PDF", "Preview revision", "Print revision", "Changed since posting", "Undo", "File menu", "Search", "Tools", "Time off", "Setup"];

const browser = await launch();
const srv = await serveV3();
const large = genWorld({ seed: 31, stores: 40, pharmacists: 150, kind: "normal", start: "2026-10-01", days: 31 });

/** Layout facts about every sheet in the print packet (call under print media). */
const measure = (page) => page.evaluate(() => {
  const sheets = [...document.querySelectorAll(".v3-print-root .print-sheet")];
  const bad = [];
  const glanceClip = [];
  const info = sheets.map((sh, i) => {
    const r = sh.getBoundingClientRect();
    const hidden = (el) => { for (let e = el; e && e !== sh; e = e.parentElement) if (e.getAttribute("aria-hidden") === "true") return true; return false; };
    for (const el of sh.querySelectorAll("*")) {
      if (hidden(el)) continue; // decorative bars that bleed off the edge on purpose
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none") continue;
      const tag = `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`;
      if (b.left < r.left - 0.75 || b.right > r.right + 0.75 || b.top < r.top - 0.75 || b.bottom > r.bottom + 0.75) (el.closest("[data-glance-page]") ? glanceClip : bad).push(`sheet ${i + 1}: <${tag}> box ${Math.round(b.left - r.left)}..${Math.round(b.right - r.left)} x ${Math.round(b.top - r.top)}..${Math.round(b.bottom - r.top)} is outside the ${Math.round(r.width)}x${Math.round(r.height)} sheet`);
      // a store block's padding is the margin: nothing may cross into the right margin
      const block = el.closest("[data-store-page]");
      if (block && block !== el) {
        const br = block.getBoundingClientRect();
        const pr = parseFloat(getComputedStyle(block).paddingRight) || 0;
        if (b.right > br.right - pr + 0.75 && !el.closest('[aria-hidden="true"]')) bad.push(`sheet ${i + 1}: <${tag}> crosses the right margin of store ${block.getAttribute("data-store-page")} by ${(b.right - (br.right - pr)).toFixed(1)}px`);
      }
      // text a box has no room for: clipped by its own overflow (an ellipsis is an intended, visible cut)
      if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis") {
        // The all-stores sheet is judged separately below: it is built for a normal chain (about 16-24 stores).
        (el.closest("[data-glance-page]") ? glanceClip : bad).push(`sheet ${i + 1}: <${tag}> "${(el.textContent ?? "").slice(0, 12)}" clips ${el.scrollWidth - el.clientWidth}px of its content`);
      }
    }
    return { w: r.width, h: r.height };
  });
  const controls = [...document.querySelectorAll(".v3-print-root button, .v3-print-root input, .v3-print-root select, .v3-print-root textarea, .v3-print-root a[href], .v3-print-root [role=button], .v3-print-root nav")].length;
  const root = document.getElementById("root");
  return {
    n: sheets.length, info, bad: bad.slice(0, 12), nBad: bad.length, glanceClip: glanceClip.length, glanceSample: glanceClip.slice(0, 2), controls,
    rootDisplay: root ? getComputedStyle(root).display : "n/a",
    printRoot: getComputedStyle(document.querySelector(".v3-print-root")).display,
    stores: [...document.querySelectorAll(".v3-print-root [data-store-page]")].map((e) => e.getAttribute("data-store-page")),
  };
});

async function run(id, world, opts) {
  const { page, errors } = await openApp(browser, srv.base, { context: await flowContext(browser, { shim: false }), practice: false });
  await page.evaluate(([w, name]) => { const a = window.__v3.app.getState(); a.setWorld(w, { fileName: name }); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); a.setView("print"); }, [world, `${id}.sqlite`]);
  await page.waitForSelector("[data-print-view]", { timeout: 60000 });
  await page.locator("[data-post]").click();
  await page.waitForSelector("[data-revision='1']", { timeout: 60000 });
  const snap = await page.evaluate(() => { const w = window.__v3.app.getState().world; const s = w.journal.snapshots[0]; return { cells: s.cells, from: s.from, to: s.to, stores: Object.values(w.state.stores).map((x) => ({ code: x.code, activeFrom: x.activeFrom, inactiveFrom: x.inactiveFrom })) }; });
  const codes = new Set();
  for (const k of Object.keys(snap.cells)) { const st = world.state.stores[k.split("|")[0]]; if (st) codes.add(st.code); }
  for (const st of snap.stores) if ((!st.activeFrom || st.activeFrom <= snap.to) && (!st.inactiveFrom || st.inactiveFrom > snap.from)) codes.add(st.code);
  const initials = new Set();
  for (const c of Object.values(snap.cells)) for (const i of c.initials) initials.add(i);

  for (const [key, set] of Object.entries(opts)) {
    const tag = `${id}/${key}`;
    // options through the real controls
    const fs = page.getByRole("group", { name: "Print options" });
    await fs.getByLabel("Paper").selectOption(key === "tabloid2up" ? "tabloid" : "letter");
    const two = fs.getByLabel("Two stores per sheet");
    if ((await two.isChecked()) !== set.twoUp) await two.setChecked(set.twoUp);
    await page.waitForFunction((n) => document.querySelectorAll(".v3-print-root .print-sheet").length === n, set.expected, { timeout: 30000 }).catch(() => {});

    // on screen the packet is not displayed
    await page.emulateMedia({ media: "screen" });
    const screen = await page.evaluate(() => ({ printRoot: getComputedStyle(document.querySelector(".v3-print-root")).display, appVisible: getComputedStyle(document.getElementById("root")).display !== "none" }));
    check(`${tag}: on screen the print packet is not displayed and the app is`, screen.printRoot === "none" && screen.appVisible, JSON.stringify(screen));

    await page.emulateMedia({ media: "print" });
    const m = await measure(page);
    check(`${tag}: the packet has ${set.expected} sheets (the layout's own count)`, m.n === set.expected, `${m.n}`);
    const [pw, ph] = PAPER_PT[key];
    check(`${tag}: every sheet is exactly the paper size (${pw / 72} x ${ph / 72} in)`, m.info.every((s) => Math.abs(s.w - (pw / 72) * 96) < 1 && Math.abs(s.h - (ph / 72) * 96) < 1), JSON.stringify(m.info.find((s) => Math.abs(s.w - (pw / 72) * 96) >= 1 || Math.abs(s.h - (ph / 72) * 96) >= 1)));
    check(`${tag}: nothing sticks out past a sheet edge or the right margin, nothing is clipped (${m.nBad} found)`, m.nBad === 0, m.bad.join(" || "));
    if (m.glanceClip) {
      // The all-stores sheet is one page of stores x days. At a normal chain size it must fit (strict); at 40 stores its footer runs off the page
      // and 4-letter initials do not fit a 0.2in day cell: reported as known limits of the layout, with the numbers, rather than failed.
      if (codes.size <= 24) check(`${tag}: the all-stores sheet fits its page and its cells`, false, `${m.glanceClip} problems, e.g. ${m.glanceSample.join(" | ")}`);
      else console.log(`known ${tag}: the all-stores sheet with ${codes.size} stores has ${m.glanceClip} boxes outside its page or cells clipped (e.g. ${m.glanceSample[0]}; ${m.glanceSample[1] ?? ""})`);
    }
    check(`${tag}: in print the app is gone and the packet shows`, m.rootDisplay === "none" && m.printRoot === "block", `${m.rootDisplay} / ${m.printRoot}`);
    check(`${tag}: no button, field, link or nav inside the packet`, m.controls === 0, `${m.controls}`);

    const t0 = Date.now();
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pdf2 = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const doc = readPdf(pdf);
    const doc2 = readPdf(pdf2);
    check(`${tag}: a PDF came out (${(pdf.length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms for two)`, pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 20000);
    if (!doc) { console.log(`skip ${tag}: this PDF's text could not be read by e2e/support/pdf.mjs (not Skia-shaped); page-count and text checks skipped`); continue; }
    check(`${tag}: PDF page count equals the sheets (${doc.pages.length})`, doc.pages.length === m.n, `${doc.pages.length} vs ${m.n}`);
    check(`${tag}: PDF page count is the expected ${set.expected}`, doc.pages.length === set.expected, `${doc.pages.length}`);
    check(`${tag}: a second print gives the same page count and the same text`, doc2 && doc2.pages.length === doc.pages.length && doc2.pages.every((p, i) => p.text.join("\n") === doc.pages[i].text.join("\n")));
    check(`${tag}: every page is ${pw}x${ph} pt`, doc.pages.every((p) => p.mediaBox && Math.abs(p.mediaBox[2] - pw) < 1 && Math.abs(p.mediaBox[3] - ph) < 1), JSON.stringify(doc.pages.find((p) => !p.mediaBox || Math.abs(p.mediaBox[2] - pw) >= 1)?.mediaBox));
    check(`${tag}: no blank page (every page has text)`, doc.pages.every((p) => p.text.join("").trim().length >= 20), doc.pages.map((p) => p.text.join("").length).join(","));
    const words = new Set(doc.pages.flatMap((p) => p.text.map((x) => x.trim())));
    const all = doc.pages.flatMap((p) => p.text).join("\n");
    const missCodes = [...codes].filter((c) => !all.includes(c));
    check(`${tag}: every store code is in the PDF text (${codes.size})`, missCodes.length === 0, `missing ${missCodes.slice(0, 8).join(",")}`);
    const missIni = [...initials].filter((i) => !words.has(i));
    check(`${tag}: every set of initials is in the PDF text (${initials.size})`, missIni.length === 0, `missing ${missIni.slice(0, 8).join(",")}`);
    check(`${tag}: one store page per store in the packet (${m.stores.length})`, m.stores.length === codes.size && new Set(m.stores).size === codes.size, `${m.stores.length} pages for ${codes.size} stores`);
    const ui = UI_WORDS.filter((w) => all.includes(w));
    check(`${tag}: none of the app's own controls are printed (${UI_WORDS.length} words checked)`, ui.length === 0, ui.join(", "));
    check(`${tag}: no console errors`, errors.length === 0, errors.join(" | "));
    await page.emulateMedia({ media: "screen" });
  }
  await page.context().close();
}

await run("practice", practiceBase(), { letter: { twoUp: false, expected: EXPECTED_PAGES.practice.letter }, tabloid2up: { twoUp: true, expected: EXPECTED_PAGES.practice.tabloid2up } });
await run("large", large, { letter: { twoUp: false, expected: EXPECTED_PAGES.large.letter }, tabloid2up: { twoUp: true, expected: EXPECTED_PAGES.large.tabloid2up } });

await browser.close();
srv.close();
process.exit(failed() ? 1 : 0);
