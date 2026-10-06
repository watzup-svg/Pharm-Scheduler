// Hostile text everywhere: names, store codes, notes, checkpoint and change labels set to markup, script, RTL overrides, zero-width and
// combining floods, emoji sequences, 5,000-character unbroken strings, NUL and lone surrogates. Every screen is visited; nothing may run
// (window.__pwned stays unset, no dialogs), no console errors, no sideways page scroll, nothing sticks out past the viewport unclipped,
// text shows as text, and a save through the real codec then reopen gives back every string exactly. Build first: npm run build:v3.
//   node e2e/v3-hostile-text.mjs
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const HOSTILE = [
  `<img src=x onerror="window.__pwned=1">`,
  `</script><script>window.__pwned=2</script>`,
  `javascript:window.__pwned=3`,
  `<a href="javascript:window.__pwned=4">click</a>`,
  `<svg onload="window.__pwned=5"></svg>`,
  `\u202eevil\u202c gnp.exe \u2067x\u2069 \u2066y\u2069`,
  `a\u200db\u200cc\u200b\ufeffd\u2060e`,
  `z${"\u0301\u0336\u0489".repeat(120)}algo`,
  `\u{1F469}\u200d\u2695\ufe0f \u{1F468}\u200d\u{1F469}\u200d\u{1F467}\u200d\u{1F466} \u{1F3F3}\ufe0f\u200d\u{1F308} \u{1F1FA}\u{1F1F8}`,
  "W".repeat(5000),
  "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(6),
  `nul\u0000byte`,
  `lone\uD800high`,
  `\uDC00low`,
  "`${window.__pwned=6}`",
  `{{constructor.constructor('window.__pwned=7')()}}`,
  `'; DROP TABLE stores; --`,
  `%s%n%x \\u003cscript\\u003e &lt;b&gt; &#60;i&#62;`,
  `"><iframe srcdoc="<script>parent.__pwned=8</script>">`,
  `=HYPERLINK("http://example.invalid","x")`,
  `line one\nline two\ttabbed\r\nline three`,
  `\u0000\u0001\u0008\u000B\u001F\u007F\u0085\u2028\u2029`,
  `__proto__`,
  `constructor`,
];
const SHORT = HOSTILE.filter((h) => h.length < 300);
const FULL_MATCH = (h) => h.length < 300 && !/[\uD800-\uDFFF]/.test(h.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""));

const b = await launch();
const srv = await serveV3();
// Real pickers are not available headless; OPFS-backed handles stand in (same as v3-persist.mjs), so Save As / Open go through the real codec.
const PICKER_SHIM = `
  window.__nextOpen = null;
  window.showSaveFilePicker = async (o) => (await navigator.storage.getDirectory()).getFileHandle(o?.suggestedName || 'x.sqlite', { create: true });
  window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle(window.__nextOpen)];
`;
const ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, acceptDownloads: true });
await ctx.addInitScript(PICKER_SHIM);
const { page, errors } = await openApp(b, srv.base, { context: ctx });
const dialogs = [];
page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
await page.evaluate(() => { const a = window.__v3.app.getState(); a.setWindow("2026-10-01", "2026-10-31"); a.setAsOf("2026-10-06"); });
// The detectors must see what they look for: a script that runs, a box past the edge.
{
  await page.evaluate(() => { document.body.insertAdjacentHTML("beforeend", '<div id="selftest"><img src="data:image/png;base64,AAAA" onerror="window.__pwned=0"><div style="position:absolute;left:3000px;width:50px;height:20px">x</div></div>'); });
  await page.waitForTimeout(200);
  check("self-test: an injected onerror handler would be noticed", (await page.evaluate(() => window.__pwned)) === 0);
  await page.evaluate(() => { document.getElementById("selftest").remove(); delete window.__pwned; });
}
const baseline = await page.evaluate(() => ({ scripts: document.scripts.length, html: document.documentElement.outerHTML.length }));

// ---------------------------------------------------------------- put the hostile text into the schedule
const placed = await page.evaluate((H) => {
  const app = window.__v3.app;
  const out = { fails: [], ph: {}, st: {}, notes: [], assignments: [] };
  const commit = (edits, label) => { const ok = app.getState().commit(edits, label); if (!ok) out.fails.push(label); return ok; };
  const st0 = app.getState().world.state;
  const phIds = Object.keys(st0.pharmacists).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const stIds = Object.keys(st0.stores).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  // Pharmacist names and initials. One commit each so every edit goes through the real path.
  phIds.forEach((id, i) => {
    const name = H[i % H.length];
    const initials = i % 3 === 0 ? H[(i + 5) % H.length].slice(0, 6) : st0.pharmacists[id].initials;
    commit([{ t: "pharmacist.set", pharmacist: { ...app.getState().world.state.pharmacists[id], name, initials } }], `name ${i}`);
    out.ph[id] = name;
  });
  // Store names; codes hostile on a few (shown in every cell, so keep most short).
  const codes = [H[0].slice(0, 12), "=1+1", "\u202eabc", "A\u200dB", H[9], H[10].slice(0, 45), "<b>x</b>", "\u0301".repeat(30)];
  stIds.forEach((id, i) => {
    const s = app.getState().world.state.stores[id];
    const name = H[(i + 3) % H.length];
    const code = i < codes.length ? codes[i] : s.code;
    commit([{ t: "store.set", store: { ...s, name, code } }], `store ${i}`);
    out.st[id] = { name, code };
  });
  // Notes: time off, date overrides (closed day notes), partial-day notes.
  const w = () => app.getState().world.state;
  phIds.slice(0, 8).forEach((id, i) => {
    const note = H[(i * 3) % H.length];
    const day = `2026-10-${String(22 + (i % 8)).padStart(2, "0")}`;
    if (commit([{ t: "unavail.add", pharmacistId: id, first: day, last: day, status: "Approved", type: "Vacation", note }], `time off ${i}`)) out.notes.push({ kind: "timeoff", pharmacistId: id, date: day, note });
  });
  stIds.slice(0, 8).forEach((id, i) => {
    const note = H[(i * 5 + 1) % H.length];
    const date = `2026-10-${String(26 + (i % 5)).padStart(2, "0")}`;
    if (commit([{ t: "dateOverride.set", storeId: id, date, count: i % 2, note }], `closed ${i}`)) out.notes.push({ kind: "override", storeId: id, date, note });
  });
  Object.values(w().assignments).filter((a) => a.date >= "2026-10-07" && a.date <= "2026-10-20").slice(0, 8).forEach((a, i) => {
    const note = H[(i * 2 + 7) % H.length].trim() || "x";
    if (commit([{ t: "update", assignmentId: a.id, patch: { partialNote: note } }], `partial ${i}`)) out.assignments.push({ id: a.id, storeId: a.storeId, pharmacistId: a.pharmacistId, date: a.date, note });
  });
  H.slice(0, 6).forEach((name, i) => app.getState().checkpoint(name + i));
  return out;
}, HOSTILE);
check("every hostile edit was accepted by the domain", placed.fails.length === 0, placed.fails.slice(0, 5).join(", "));
check("hostile names, notes and checkpoints are in the schedule", placed.notes.length >= 12 && placed.assignments.length >= 4, `${placed.notes.length} notes, ${placed.assignments.length} partial-day notes`);

// Post once so Print and the print model have a snapshot; mark some told so To tell has content; change something after posting.
await page.evaluate(() => {
  const app = window.__v3.app.getState();
  app.post({ from: "2026-10-01", to: "2026-10-31" });
});
await page.evaluate(() => {
  const app = window.__v3.app.getState();
  const w = app.world;
  const a = Object.values(w.state.assignments).find((x) => x.date >= "2026-10-08");
  app.commit([{ t: "remove", assignmentId: a.id }], "after posting");
});

// ---------------------------------------------------------------- probes
const probe = ({ limit }) => {
  const out = [];
  const sel = (el) => {
    let t = el.tagName.toLowerCase();
    if (el.id) t += `#${el.id}`;
    const al = el.getAttribute("aria-label");
    if (al) t += `[aria-label="${al.slice(0, 20)}"]`;
    else if (typeof el.className === "string" && el.className.trim()) t += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    return t;
  };
  const de = document.documentElement;
  if (de.scrollWidth > limit) out.push(["html", `page scrolls sideways: scrollWidth ${de.scrollWidth} > ${limit}`]);
  if (document.body.scrollWidth > limit) out.push(["body", `body scrollWidth ${document.body.scrollWidth} > ${limit}`]);
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; };
  const clipping = (cs) => ["auto", "scroll", "hidden", "clip"].includes(cs.overflowX);
  const clippedByAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (clipping(getComputedStyle(p))) { const pr = p.getBoundingClientRect(); if (pr.right <= limit + 1 && pr.left >= -1) return true; }
    }
    return false;
  };
  const reported = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    // 1. past the viewport sideways, with nothing clipping it
    if (r.right > limit + 1 || r.left < -1) {
      if (clippedByAncestor(el)) continue;
      if (getComputedStyle(el).position === "fixed" && r.width > limit) continue;
      if (reported.some((x) => x.contains(el))) continue;
      reported.push(el);
      out.push([sel(el), `box ${Math.round(r.left)}..${Math.round(r.right)} outside 0..${limit}`]);
    }
  }
  // 2. a box that is wider than the box that holds it, with nothing clipping or scrolling it: text spilling out of its container
  const seen = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg") || !visible(el)) continue;
    const p = el.parentElement;
    if (!p || p === document.body || p === document.documentElement) continue;
    const cs = getComputedStyle(el), pcs = getComputedStyle(p);
    if (cs.position === "absolute" || cs.position === "fixed" || pcs.display === "contents") continue;
    const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (r.width < 1 || pr.width < 1) continue;
    if (r.right > pr.right + 2 && !clipping(pcs) && !clippedByAncestor(el) && (el.textContent ?? "").length > 40) {
      const k = sel(p);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([`${sel(p)} > ${sel(el)}`, `child ends ${Math.round(r.right - pr.right)}px past its container (${Math.round(r.width)} in ${Math.round(pr.width)})`]);
    }
  }
  return out;
};
const safety = () => page.evaluate((b) => ({
  pwned: window.__pwned,
  scripts: document.scripts.length - b.scripts,
  handlers: document.querySelectorAll("[onerror],[onload],[onclick],[onfocus],[onmouseover]").length,
  jsLinks: [...document.querySelectorAll("[href],[src],[action],[formaction]")].filter((e) => /^\s*javascript:/i.test(e.getAttribute("href") ?? e.getAttribute("src") ?? e.getAttribute("action") ?? e.getAttribute("formaction") ?? "")).length,
  imgX: document.querySelectorAll('img[src="x"], iframe[srcdoc], svg[onload]').length,
}), baseline);
const settle = async () => { await page.waitForTimeout(80); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
/** True when some element's own text, or some input's value, is exactly this string. */
const shownExactly = (text) => page.evaluate((t) => {
  for (const e of document.body.querySelectorAll("*")) {
    if ((e.tagName === "INPUT" || e.tagName === "TEXTAREA") && e.value === t) return true;
    if (e.children.length === 0 && e.textContent === t) return true;
    // text node children joined (an element with text and inline children)
    let own = "";
    for (const n of e.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    if (own === t) return true;
  }
  return document.body.textContent.includes(t);
}, text);

{
  await page.evaluate(() => { document.body.insertAdjacentHTML("beforeend", '<div id="selftest2" style="position:absolute;left:3000px;top:0;width:50px;height:20px">x</div>'); });
  const got = await page.evaluate(probe, { limit: 1366 });
  await page.evaluate(() => document.getElementById("selftest2").remove());
  check("self-test: the layout probe reports a box past the edge", got.some(([, d]) => /outside/.test(d)), JSON.stringify(got));
}
const problems = [];
async function visit(name, go, expect = []) {
  await page.evaluate(go.fn, go.arg);
  await settle();
  if (go.after) { await go.after(); await settle(); }
  const got = await page.evaluate(probe, { limit: 1366 });
  const s = await safety();
  const safe = s.pwned === undefined && s.scripts === 0 && s.handlers === 0 && s.jsLinks === 0 && s.imgX === 0;
  check(`${name}: nothing ran, no injected elements`, safe, JSON.stringify(s));
  check(`${name}: fits (no sideways scroll, nothing past the edge or its container)`, got.length === 0, got.slice(0, 4).map((x) => x.join(" ")).join(" | ").slice(0, 600));
  for (const g of got) problems.push(`${name}|${g.join("|")}`);
  for (const t of expect) check(`${name}: "${t.slice(0, 24).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e]/g, "?")}" is shown exactly as text`, await shownExactly(t));
}
const openMore = async () => { for (const btn of await page.getByRole("button", { name: /More for this day/ }).all()) await btn.click().catch(() => {}); };
const view = (v, extra = {}) => ({ fn: ({ v, extra }) => { const a = window.__v3.app.getState(); a.select(extra.sel ?? null); a.setDrawer(!!extra.drawer, extra.drawer); a.setOutForm(!!extra.outForm); a.setAxis(extra.axis ?? "store"); a.setView(v); if (extra.tab) a.setSetupTab(extra.tab); }, arg: { v, extra } });

// ---------------------------------------------------------------- every screen
const st = placed.st, ph = placed.ph;
await visit("Schedule, stores down the side", view("wall", { axis: "store" }));
await visit("Schedule, people down the side", view("wall", { axis: "pharmacist" }));
const phNote = placed.notes.find((n) => n.kind === "timeoff");
const ovNote = placed.notes.find((n) => n.kind === "override");
const part = placed.assignments[0];
const more = (v) => ({ ...v, after: openMore });
await visit("Inspector: a person on a day with a time-off note", more(view("wall", { axis: "pharmacist", sel: { pharmacistId: phNote.pharmacistId, date: phNote.date } })), FULL_MATCH(phNote.note) ? [phNote.note] : []);
await visit("Inspector: a store on a day with a note", more(view("wall", { axis: "store", sel: { storeId: ovNote.storeId, date: ovNote.date } })), FULL_MATCH(ovNote.note) ? [ovNote.note] : []);
await visit("Inspector: a placed person with a partial-day note", more(view("wall", { axis: "store", sel: { storeId: part.storeId, date: part.date } })), FULL_MATCH(part.note) ? [part.note] : []);
await visit("Inspector: the same from the people side", more(view("wall", { axis: "pharmacist", sel: { pharmacistId: part.pharmacistId, date: part.date } })));
await visit("Time off", view("timeoff"), SHORT.filter((h) => FULL_MATCH(h) && Object.values(ph).includes(h)).slice(0, 3));
await visit("Time off, new record form open", view("timeoff", { outForm: true }));
await visit("Print", view("print"));
// Every sheet of the preview, then the real Download PDF button.
{
  await page.evaluate(view("print").fn, view("print").arg);
  await settle();
  const next = page.getByRole("button", { name: "Next sheet" });
  let sheets = 0, bad = [];
  for (let i = 0; i < 80; i++) {
    sheets++;
    bad.push(...(await page.evaluate(probe, { limit: 1366 })).map((g) => g.join(" ")));
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
    await page.waitForTimeout(40);
  }
  const s2 = await safety();
  check(`Print preview: ${sheets} sheets, each fits and nothing ran`, sheets >= 5 && bad.length === 0 && s2.pwned === undefined && s2.scripts === 0 && s2.imgX === 0, `${sheets} sheets ${JSON.stringify(s2)} ${bad.slice(0, 3).join(" | ").slice(0, 400)}`);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator("[data-download]").click()]);
  const path = await dl.path();
  const head = (await import("node:fs")).readFileSync(path).subarray(0, 5).toString();
  check("Download PDF hands out a PDF named from dates and revision only", head === "%PDF-" && /^HiSchool_[0-9_a-z-]+_rev\d+\.pdf$/.test(dl.suggestedFilename()), `${head} ${dl.suggestedFilename()}`);
}
for (const tab of ["stores", "pharmacists", "patterns", "dates", "travel", "rules", "checks"]) {
  const expect = tab === "pharmacists" ? SHORT.filter((h) => FULL_MATCH(h) && Object.values(ph).includes(h) && h === h.trim()).slice(0, 3)
    : tab === "stores" ? SHORT.filter((h) => FULL_MATCH(h) && Object.values(st).some((s) => s.name === h) && h === h.trim()).slice(0, 3)
    : tab === "dates" ? placed.notes.filter((n) => n.kind === "override" && FULL_MATCH(n.note) && n.note === n.note.trim()).slice(0, 2).map((n) => n.note) : [];
  await visit(`Setup / ${tab}`, view("setup", { tab }), expect);
}
await visit("To tell", view("wall", { drawer: "tell" }));
await visit("History", view("wall", { drawer: "history" }), HOSTILE.slice(0, 6).map((h, i) => h + i).filter((t) => FULL_MATCH(t) && t === t.trim()).slice(0, 3));
await visit("Queue", view("wall", { drawer: "queue" }));
await visit("Search palette (typing a hostile name)", { ...view("wall"), after: async () => {
  await page.keyboard.press("Control+k");
  await page.keyboard.type("<img");
  await page.waitForTimeout(150);
} });
await page.keyboard.press("Escape");
await visit("Search palette (typing a store code)", { ...view("wall"), after: async () => {
  await page.keyboard.press("Control+k");
  await page.keyboard.type("=1");
  await page.waitForTimeout(150);
} });
await page.keyboard.press("Escape");
await visit("Scenario named with hostile text", { ...view("wall"), after: async () => { await page.evaluate((n) => window.__v3.app.getState().openScenario(n), HOSTILE[0]); } });
await page.evaluate(() => window.__v3.app.getState().discardScenario());

// ---------------------------------------------------------------- print model and PDF with the hostile text
{
  const r = await page.evaluate(() => {
    const out = {};
    try {
      const m = window.__v3print.modelFor(1);
      out.stores = m?.stores?.length;
      out.filename = m?.filename;
      out.pdf = window.__v3print.pdfHash(1);
    } catch (e) { out.error = String(e?.stack ?? e); }
    return out;
  });
  check("print model and PDF build with hostile names and codes", !r.error && r.stores >= 10 && /^\d+:[0-9a-f]+$/.test(r.pdf ?? ""), JSON.stringify(r).slice(0, 400));
  check("PDF file name is made of dates and the revision only", /^HiSchool_[0-9_a-z-]+_rev\d+\.pdf$/.test(r.filename ?? ""), r.filename);
}

// ---------------------------------------------------------------- save, reopen, compare every string
{
  const name = "Hostile.sqlite";
  const before = await page.evaluate(() => { const w = window.__v3.app.getState().world; return JSON.stringify({ s: w.state, j: w.journal }); });
  await page.evaluate(() => { const a = window.__v3.app.getState(); a.setView("wall"); a.setDrawer(false); });
  const saved = await page.evaluate(async (n) => {
    window.__persistSaveName = n;
    return window.__persist.saveAs(window.__v3.app.getState().world);
  }, name);
  check("Save As writes the schedule (the real codec, hostile text included)", saved.ok === true && saved.bytes > 10000, JSON.stringify(saved));
  const fileName = await page.evaluate(() => window.__persist.status().fileName);
  check("the file name is plain", /^[\w .()-]+\.sqlite$/.test(fileName ?? ""), fileName);
  await page.evaluate((n) => { window.__nextOpen = n; }, fileName);
  const opened = await page.evaluate(async () => {
    const r = await window.__persist.open({ force: true });
    return { state: r.state, error: r.error, json: r.world ? JSON.stringify({ s: r.world.state, j: r.world.journal }) : null };
  });
  check("the saved file opens again", opened.state === "world", `${opened.state} ${opened.error ?? ""}`);
  check("every string comes back exactly (state and history identical)", opened.json === before, opened.json ? `first difference at char ${[...before].findIndex((c, i) => c !== opened.json[i])}` : "no world");
  // And the app can show the reopened world.
  await page.evaluate(() => window.__v3.app.getState().setView("wall"));
  await settle();
}

check("no dialogs (alert/confirm/prompt) were triggered", dialogs.length === 0, dialogs.join(" | ").slice(0, 200));
check("window.__pwned never set (final)", (await page.evaluate(() => window.__pwned)) === undefined);
check("no console errors or page errors", errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 500));
if (problems.length) {
  console.log(`\nscreen|selector|detail   (${problems.length})`);
  for (const p of problems.slice(0, 40)) console.log(p.replace(/[\u0000-\u001f]/g, "?").slice(0, 300));
}
await b.close(); srv.close();
process.exit(failed() ? 1 : 0);
