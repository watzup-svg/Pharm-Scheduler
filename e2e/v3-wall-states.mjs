// The wall's cell language on constructed worlds: colour = covered or not, one small picture = the worst thing still unresolved.
//   green block, no text = good; green + red picture = covered but a broken rule remains; green + amber = look at it; green + quiet = for information
//   pink + open picture (+ a number) = needs cover; hatch = closed; accepted problems show nothing; past days carry no pictures; no initials on the store rows.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
import { flowContext } from "./support/flow.mjs";

const srv = await serveV3();
const browser = await launch();
try {
  const ctx = await flowContext(browser, { shim: false });
  const { page, errors } = await openApp(browser, srv.base, { context: ctx });
  const st = (fn, arg) => page.evaluate(fn, arg);
  await st(() => { const a = window.__v3.app.getState(); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); a.setAxis("store"); });
  await page.waitForSelector('[role="gridcell"][data-store]');
  const cell = (sid, date) => page.locator(`[role="gridcell"][data-store="${sid}"][data-date="${date}"]`);
  const look = async (sid, date) => { const c = cell(sid, date); return { block: await c.getAttribute("data-block"), icon: await c.getAttribute("data-icon"), sev: await c.getAttribute("data-sev"), text: ((await c.innerText()) ?? "").trim(), label: await c.getAttribute("aria-label"), tip: await c.getAttribute("data-tip") }; };

  // A clean covered future cell with one person (a Tuesday or later), and a second pharmacist already placed elsewhere that day.
  const pick = await st(() => {
    const s = window.__v3.app.getState().world.state;
    const by = {};
    for (const a of Object.values(s.assignments)) (by[`${a.storeId}|${a.date}`] ??= []).push(a);
    for (const [k, list] of Object.entries(by)) {
      const [sid, date] = k.split("|");
      if (date < "2026-10-12" || list.length !== 1) continue;
      const lic = (pid) => { const p = s.pharmacists[pid]; const st = s.stores[sid].state; return !!p.licenses && (!st || st in p.licenses); };
      const others = Object.values(s.assignments).filter((b) => b.date === date && b.storeId !== sid && b.pharmacistId !== list[0].pharmacistId && lic(b.pharmacistId));
      const other = others.find((b) => s.pharmacists[b.pharmacistId].baseStoreId === sid) ?? others[0];
      const unlic = Object.values(s.pharmacists).find((p) => p.licenses && s.stores[sid].state && !(s.stores[sid].state in p.licenses) && !Object.values(s.assignments).some((b) => b.pharmacistId === p.id && b.date === date));
      if (other && unlic) return { sid, date, aid: list[0].id, other: other.id, otherPid: other.pharmacistId, otherStore: other.storeId, unlic: unlic.id };
    }
    return null;
  });
  if (!pick) { check("found a clean cell to build the states on", false); throw new Error("no pick"); }
  const { sid, date } = pick;
  let l = await look(sid, date);
  check("GOOD: covered, nothing wrong = green block, no picture, no text", l.block === "good" && !l.icon && l.text === "", JSON.stringify(l));
  check("GOOD: the accessible name is a full sentence with the person's name", /covered by .+/i.test(l.label) && /^[A-Z]+, \w{3} \w{3} \d+: /.test(l.label), l.label);

  // covered by one person, plus an extra who is not licensed here: still green, with the red licence picture
  await st(({ sid, date, unlic }) => window.__v3.app.getState().commit([{ t: "place", storeId: sid, pharmacistId: unlic, date }]), pick);
  l = await look(sid, date);
  check("COVERED + unlicensed extra: GREEN with a RED licence picture", l.block === "good" && l.icon === "licence" && l.sev === "bad", JSON.stringify(l));
  check("  the hover note and the accessible name say who and why", /not licensed/.test(l.tip) && /not licensed/.test(l.label), l.tip);
  check("  no initials on the block", l.text === "", l.text);
  await st(() => { const a = window.__v3.app.getState(); a.commit([{ t: "remove", assignmentId: Object.values(a.world.state.assignments).slice(-1)[0].id }]); });
  l = await look(sid, date);
  check("  removing the extra clears the picture", l.block === "good" && !l.icon, JSON.stringify(l));

  // double booking that the DM accepted shows nothing; before accepting it shows the red double picture
  await st(({ sid, date, otherPid }) => window.__v3.app.getState().commit([{ t: "place", storeId: sid, pharmacistId: otherPid, date, agreed: true }]), pick);
  l = await look(sid, date);
  check("COVERED + a double-booked extra: GREEN with a RED double picture", l.block === "good" && l.icon === "double" && l.sev === "bad", JSON.stringify(l));
  await st(({ sid, date, otherPid }) => {
    const a = window.__v3.app.getState();
    const ids = Object.values(a.world.state.assignments).filter((x) => x.pharmacistId === otherPid && x.date === date).map((x) => x.id);
    a.commit(ids.map((id) => ({ t: "override", assignmentId: id, ruleId: "double-booking", reason: "test" })));
  }, pick);
  l = await look(sid, date);
  check("ACCEPTED override: the double picture is gone (nothing else, unless a real warning remains)", l.block === "good" && l.icon !== "double" && l.sev !== "bad" && l.text === "", JSON.stringify(l));
  check("  but the hover note still says it was accepted", /Accepted/.test(l.tip), l.tip);

  // open, short, locum, closed, past, two-person
  const open = await st(() => [...document.querySelectorAll('[role="gridcell"][data-store][data-block="open"]')].filter((e) => e.dataset.date >= "2026-10-06" && !Object.values(window.__v3.app.getState().world.state.assignments).some((a) => a.storeId === e.dataset.store && a.date === e.dataset.date)).map((e) => ({ sid: e.dataset.store, date: e.dataset.date, icon: e.dataset.icon })));
  check("NEEDS COVER: pink block with the open picture", open.length >= 2 && open.every((o) => o.icon === "open"), JSON.stringify(open.slice(0, 2)));
  const o0 = await look(open[0].sid, open[0].date);
  check("  text is only a count or a fraction", /^[\d/\s]*$/.test(o0.text), o0.text);
  await st((o) => window.__v3.app.getState().commit([{ t: "cell.set", storeId: o.sid, date: o.date, acceptedShort: 1 }]), open[0]);
  l = await look(open[0].sid, open[0].date);
  check("ACCEPTED SHORT: green with the quiet picture", l.block === "good" && l.icon === "short" && l.sev === "quiet", JSON.stringify(l));
  await st((o) => window.__v3.app.getState().commit([{ t: "cell.set", storeId: o.sid, date: o.date, locum: 1 }]), open[1]);
  l = await look(open[1].sid, open[1].date);
  check("LOCUM: green with the quiet picture", l.block === "good" && l.icon === "locum" && l.sev === "quiet", JSON.stringify(l));
  const closed = await page.locator('[role="gridcell"][data-store][data-block="closed"]').first();
  check("CLOSED: hatch, nothing else", (await closed.locator(".w-block.hatch").count()) === 1 && ((await closed.innerText()) ?? "").trim() === "" && !(await closed.getAttribute("data-icon")));
  const past = await st(() => [...document.querySelectorAll('[role="gridcell"][data-store]')].filter((e) => e.dataset.date < "2026-10-06").filter((e) => e.dataset.icon || e.querySelector("[data-statemark]")).length);
  check("PAST days carry no pictures", past === 0, String(past));
  check("PAST days are dimmed", (await page.locator('.w-cell.w-past[data-store]').count()) === 5 * 16);
  const initials = await st(() => [...document.querySelectorAll('[role="gridcell"][data-store]')].filter((e) => !/^[\d/+−\s]*$/.test(e.textContent ?? "")).length);
  check("no initials or names in any store-axis cell", initials === 0, String(initials));

  // severity picture colour in the DOM follows the tone
  const tones = await st(() => { const m = {}; for (const e of document.querySelectorAll('[role="gridcell"][data-store] [data-statemark]')) m[e.dataset.statemark] = e.dataset.tone; return m; });
  check("picture colour follows severity (open red, short quiet)", tones.open === "bad" && (tones.short ?? "quiet") === "quiet", JSON.stringify(tones));

  // the practice-with-problems world: green dominant, few pictures
  await st(() => window.__v3.loadProblems());
  await st(() => { const a = window.__v3.app.getState(); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); });
  await page.waitForSelector('[role="gridcell"][data-store]');
  const mix = await st(() => { const c = [...document.querySelectorAll('[role="gridcell"][data-store]')]; const n = (f) => c.filter(f).length; return { all: c.length, good: n((e) => e.dataset.block === "good"), icons: n((e) => e.dataset.icon), open: n((e) => e.dataset.block === "open") }; });
  check("problems world: green dominates, pictures are the minority", mix.good > mix.all / 2 && mix.icons < mix.all / 4 && mix.open > 3, JSON.stringify(mix));
  const initialsP = await st(() => [...document.querySelectorAll('[role="gridcell"][data-store]')].filter((e) => !/^[\d/+−\s]*$/.test(e.textContent ?? "")).length);
  check("problems world: no initials in store cells", initialsP === 0);

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally { await browser.close(); srv.close(); }
console.log(failed() ? `${failed()} check(s) failed` : "all wall state checks passed");
process.exit(failed() ? 1 : 0);
