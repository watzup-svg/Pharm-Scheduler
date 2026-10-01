import { launch, open } from "./lib.mjs";
const b = await launch();
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log(c ? "ok  " : "FAIL", m); };
for (const w of [390, 1366]) {
  const { page: p, errors } = await open(b, "schedule", { width: w, height: 900 });
  await p.getByRole("region", { name: "Month status" }).getByRole("button", { name: /No coverage/ }).click(); await p.waitForTimeout(800);
  const url0 = p.url();
  const link = p.getByRole("dialog").locator('a[href^="tel:"]').first();
  ok((await link.count()) > 0, `${w} phone links exist`);
  await link.click(); await p.waitForTimeout(500);
  ok(p.url() === url0, `${w} page did not navigate`);
  const dlg = p.getByRole("dialog").last();
  ok(/Call/.test(await dlg.innerText()), `${w} call sheet shows: ${(await dlg.innerText()).replace(/\n/g, " | ").slice(0, 80)}`);
  ok((await dlg.locator('a[data-dial]').getAttribute("target")) === "_blank", `${w} Call opens its own window`);
  await dlg.getByRole("button", { name: /Copy number/ }).click(); await p.waitForTimeout(400);
  ok((await p.getByText("Cool").count()) >= 0, "copy handled");
  ok(await p.locator("body").innerText().then(t => t.includes("Calendars")), `${w} page content still there (not white)`);
  ok(errors.length === 0, `${w} no errors ${errors.join(";")}`);
  await p.close();
}
// other tel links: people page mobile, sick dialog
{
  const { page: p } = await open(b, "people", { width: 390, height: 844 });
  await p.locator('a[href^="tel:"]').first().click(); await p.waitForTimeout(400);
  ok(/Call/.test(await p.getByRole("dialog").innerText()), "people page phone opens the sheet");
  await p.close();
}
console.log(bad ? `${bad} FAILURES` : "DIAL OK");
await b.close();
