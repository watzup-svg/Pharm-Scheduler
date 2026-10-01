import { launch, open, hold } from "./lib.mjs";
const b = await launch();
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log(c ? "ok  " : "FAIL", m); };
for (const w of [1366, 390]) {
  const { page: p, errors } = await open(b, "schedule", { width: w, height: 900 });
  await p.getByRole("region", { name: "Month status" }).getByRole("button", { name: /Two places/ }).click(); await p.waitForTimeout(700);
  const leave = p.getByRole("button", { name: /^Leave as is/ }).first();
  const left0 = await p.locator("body").innerText();
  // mid-hold screenshot
  const box = await leave.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(380);
  await p.screenshot({ path: `/tmp/hold_mid_${w}.png`, clip: { x: Math.max(0, box.x - 160), y: Math.max(0, box.y - 80), width: Math.min(w, 520), height: 200 } });
  ok((await leave.getAttribute("data-holding")) !== null, `${w} holding state shows`);
  // release early
  await p.mouse.up(); await p.waitForTimeout(250);
  ok((await leave.getAttribute("data-holding")) === null, `${w} early release resets`);
  ok(!(await p.locator("[data-sonner-toast]").allInnerTexts()).join().includes("Left as is"), `${w} early release does not act`);
  // keyboard hold
  await leave.focus(); await p.keyboard.down("Enter"); await p.waitForTimeout(150);
  ok((await leave.getAttribute("data-holding")) !== null, `${w} keyboard hold shows`);
  await p.keyboard.up("Enter"); await p.waitForTimeout(200);
  ok((await leave.getAttribute("data-holding")) === null, `${w} keyboard early release resets`);
  // full hold acts
  await hold(p, leave, 1000); await p.waitForTimeout(500);
  const toasts = (await p.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");
  ok(/Left as is/.test(toasts), `${w} full hold acts: ${toasts.slice(0, 60)}`);
  ok(errors.length === 0, `${w} no errors ${errors.join(";")}`);
  await p.close();
}
console.log(bad ? `${bad} FAILURES` : "HOLD OK");
await b.close();
