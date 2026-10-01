import { launch, open } from "./lib.mjs";
const b = await launch();
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log(c ? "ok  " : "FAIL", m); };
for (const w of [1366, 390]) {
  const { page: p, errors } = await open(b, "schedule", { width: w, height: 900 });
  await p.getByRole("button", { name: "Place a person" }).click(); await p.waitForTimeout(300);
  await p.getByRole("dialog").getByRole("button", { name: /Lena Sorensen/ }).click(); await p.waitForTimeout(500);
  ok((await p.getByRole("button", { name: "Done" }).count()) === 1, `${w} placing bar shows`);
  const greens = await p.locator("[role=gridcell].ring-ok").count();
  ok(greens > 0, `${w} green days exist (${greens})`);
  // the empty Waldport Oct 14 cell is a hole: find a green cell and click it
  const before = await p.locator("[role=gridcell].ring-ok").count();
  await p.locator("[role=gridcell].ring-ok").first().scrollIntoViewIfNeeded();
  await p.locator("[role=gridcell].ring-ok").first().click(); await p.waitForTimeout(500);
  const toasts = (await p.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");
  ok(/Lena Sorensen on/.test(toasts), `${w} tapping a green day places: ${toasts.slice(0, 70)}`);
  // a non-green cell (filled) gives a message, not a placement
  await p.locator("[role=gridcell].opacity-35").first().click({ force: true }); await p.waitForTimeout(300);
  ok(((await p.locator("[data-sonner-toast]").allInnerTexts()).join(" ")).includes("already has"), `${w} filled day explains`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  ok((await p.getByRole("button", { name: "Done" }).count()) === 0, `${w} Escape ends placing`);
  ok(errors.length === 0, `${w} no errors ${errors.join(";")}`);
  await p.close();
}
console.log(bad ? `${bad} FAILURES` : "PLACING OK");
await b.close();
