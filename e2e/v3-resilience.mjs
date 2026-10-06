// Crash containment, diagnostics, engine worker robustness (kill, cancel, stale result).
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
const b = await launch();
const s = await serveV3();
const ctx = () => b.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const notice = (page) => page.evaluate(() => window.__v3.app.getState().notice?.text ?? "");

// 1. A render error in one screen leaves the shell usable; Try again recovers.
{
  const { page } = await openApp(b, s.base, { context: await ctx() });
  await page.evaluate(() => window.__v3.crashNext());
  await page.waitForSelector('[data-testid="screen-crash"]', { timeout: 5000 });
  const text = await page.textContent('[data-testid="screen-crash"]');
  check("crash: plain-language fallback shown", /Something broke on this screen\. Your schedule is safe\./.test(text), text);
  const btns = await page.$$eval('[data-testid="screen-crash"] button', (a) => a.map((x) => x.textContent));
  check("crash: Try again, Save a copy, Copy diagnostics offered", ["Try again", "Save a copy", "Copy diagnostics"].every((t) => btns.includes(t)), btns.join("|"));
  check("crash: shell (tabs, File menu) still on screen", (await page.getByRole("button", { name: /^Time off/ }).count()) > 0 && (await page.locator('[aria-label="File menu"]').count()) === 1);
  await page.locator('[data-testid="screen-crash"]').getByRole("button", { name: "Try again" }).click();
  await page.waitForTimeout(200);
  check("crash: Try again recovers the screen", (await page.locator('[data-testid="screen-crash"]').count()) === 0);
  // Moving to another screen also leaves a broken one behind.
  await page.evaluate(() => window.__v3.crashNext());
  await page.waitForSelector('[data-testid="screen-crash"]');
  await page.getByRole("button", { name: /^Time off/ }).first().click();
  await page.waitForTimeout(200);
  check("crash: switching screen from a broken one works", (await page.locator('[data-testid="screen-crash"]').count()) === 0 && (await page.evaluate(() => window.__v3.app.getState().view)) === "timeoff");
  check("crash: error recorded in diagnostics", (await page.evaluate(() => window.__v3.diagnostics())).includes("crashed: test crash"));
  await page.close();
}

// 2. Copy diagnostics from the File menu puts recent actions on the clipboard.
{
  const { page } = await openApp(b, s.base, { context: await ctx() });
  await page.evaluate(async () => { const a = window.__v3.app.getState(); a.checkpoint("resilience"); await a.runBuild(); });
  await page.click('[aria-label="File menu"]');
  await page.getByRole("menuitem", { name: "Copy diagnostics" }).click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("diagnostics: copied text has header, hash and counts", /State hash: \S+/.test(clip) && /pharmacists/.test(clip) && /View: wall/.test(clip), clip.slice(0, 300));
  check("diagnostics: recent actions listed (checkpoint, build, engine timing)", /action: checkpoint/.test(clip) && /action: build /.test(clip) && /engine: build \d+ms/.test(clip), clip.slice(-400));
  check("diagnostics: toast confirms", /Diagnostics copied/.test(await notice(page)));
  await page.close();
}

// 3. The worker dies in the middle of a Build: it still completes, inline.
{
  const { page } = await openApp(b, s.base);
  const r = await page.evaluate(async () => {
    const a = window.__v3.app;
    const p = a.getState().runBuild();
    window.__v3.killWorker();
    await p;
    const st = a.getState();
    return { busy: st.busy, proposal: !!st.world.session.proposal, notice: st.notice, diag: window.__v3.diagnostics() };
  });
  check("worker death: Build finished and busy cleared", r.busy === null && (r.proposal || (r.notice && r.notice.kind !== "error")), JSON.stringify({ ...r, diag: undefined }));
  check("worker death: retried in the page and recorded", /worker died, retrying in the page/.test(r.diag), r.diag.slice(-300));
  await page.close();
}

// 4. Cancel stops a long search and clears busy.
{
  const { page } = await openApp(b, s.base);
  await page.evaluate(() => { window.__v3.engine.delayMs = 60000; void window.__v3.app.getState().runBuild(); });
  await page.waitForSelector('[data-testid="cancel-engine"]');
  check("cancel: busy shown with a Cancel button", (await page.evaluate(() => window.__v3.app.getState().busy)) === "Build");
  await page.click('[data-testid="cancel-engine"]');
  await page.waitForFunction(() => window.__v3.app.getState().busy === null, null, { timeout: 5000 });
  const st = await page.evaluate(() => ({ proposal: !!window.__v3.app.getState().world.session.proposal, notice: window.__v3.app.getState().notice?.text }));
  check("cancel: busy cleared, nothing proposed, quiet notice", !st.proposal && /stopped/.test(st.notice ?? ""), JSON.stringify(st));
  check("cancel: button gone", (await page.locator('[data-testid="cancel-engine"]').count()) === 0);
  // The engine still works afterwards (the worker restarts lazily).
  await page.evaluate(async () => { window.__v3.engine.delayMs = 0; window.__v3.app.getState().clearNotice(); await window.__v3.app.getState().runImprove(false); });
  check("cancel: engine usable again", (await page.evaluate(() => window.__v3.app.getState().busy)) === null && !/took too long|could not|stopped/i.test(await notice(page)), await notice(page));
  await page.close();
}

// 5. The schedule is edited while the engine runs: the stale result is dropped.
{
  const { page } = await openApp(b, s.base);
  const r = await page.evaluate(async () => {
    const a = window.__v3.app;
    const id = Object.keys(a.getState().world.state.assignments)[0];
    a.getState().commit([{ t: "remove", assignmentId: id }]);
    const csId = a.getState().world.journal.changeSets.at(-1).id;
    window.__v3.engine.delayMs = 400;
    const p = a.getState().runBuild();
    a.getState().undo(csId); // changes the state hash while the search is out
    await p;
    window.__v3.engine.delayMs = 0;
    const st = a.getState();
    return { proposal: !!st.world.session.proposal, notice: st.notice?.text ?? "", busy: st.busy };
  });
  check("stale: result discarded with a quiet notice", !r.proposal && /changed while Build ran/.test(r.notice) && r.busy === null, JSON.stringify(r));
  await page.close();
}

await b.close(); s.close();
process.exit(failed() ? 1 : 0);
