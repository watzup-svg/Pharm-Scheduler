// The slow searches run in a worker, from http and from file://, and the page keeps painting meanwhile.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const b = await launch();
const s = await serveV3();
for (const [name, url] of [["http", s.base], ["file", "file://" + path.join(root, "dist-v3/v3.html")]]) {
  const { page, errors } = await openApp(b, url);
  const r = await page.evaluate(async () => {
    const app = window.__v3.app;
    let frames = 0;
    let go = true;
    const tick = () => { frames++; if (go) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t = performance.now();
    const p = app.getState().runImprove(true);
    const busyDuring = app.getState().busy;
    await p;
    go = false;
    await app.getState().runBuild();
    return { busyDuring, busyAfter: app.getState().busy, ms: performance.now() - t, frames, proposal: !!app.getState().world.session.proposal, notice: app.getState().notice?.text ?? null };
  });
  check(`${name}: busy flag set while running and cleared after`, r.busyDuring === "Improve" && r.busyAfter === null, JSON.stringify(r));
  check(`${name}: page kept painting (${r.frames} frames in ${r.ms.toFixed(0)} ms)`, r.frames >= 1);
  check(`${name}: build produced a proposal or a clear notice`, r.proposal || !!r.notice, JSON.stringify(r));
  check(`${name}: no page errors`, errors.length === 0, errors.join(" | "));
  await page.close();
}
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
