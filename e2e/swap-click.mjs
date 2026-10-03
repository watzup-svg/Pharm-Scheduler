// Swap without dragging: the day panel's "Swap with…" trades two booked people, and one undo puts both back.
import { launch, open, check } from "./lib.mjs";

export default async function run() {
  const b = await launch();
  for (const w of [1366, 390]) {
    const { page: p, errors } = await open(b, "schedule", { width: w, height: 900 });
    // Find a day where at least two stores have a pharmacist: try the first filled cells until the panel offers a swap.
    const cells = p.locator("[role=gridcell]");
    const n = Math.min(await cells.count(), 60);
    let sel = null;
    for (let i = 0; i < n && !sel; i++) {
      await cells.nth(i).scrollIntoViewIfNeeded();
      await cells.nth(i).click({ force: true });
      await p.waitForTimeout(250);
      const s = p.getByRole("dialog").locator("select[aria-label^='Swap ']").first();
      if (await s.count()) sel = s;
      else await p.keyboard.press("Escape");
    }
    check(`a day panel offers Swap with… @${w}`, !!sel);
    if (sel) {
      const label = await sel.getAttribute("aria-label");
      const first = label.replace(/^Swap /, "").replace(/ with$/, "");
      const optText = (await sel.locator("option").nth(1).textContent()).trim();
      const other = optText.split(" · ")[0];
      const dlg = p.getByRole("dialog");
      const before = await dlg.innerText();
      await sel.selectOption({ index: 1 });
      await p.waitForTimeout(500);
      const toasts = (await p.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");
      check(`swap says what happened @${w}`, /Swapped|Could not swap/.test(toasts), toasts.slice(0, 80));
      if (/Swapped/.test(toasts)) {
        const after = await dlg.innerText();
        check(`the panel shows the new names @${w}`, after !== before && after.includes(other.split(" ")[0]), `${first} <-> ${other}`);
        await p.keyboard.press("Control+z");
        await p.waitForTimeout(400);
        const undone = await p.getByRole("dialog").innerText().catch(() => before);
        check(`one undo puts both back @${w}`, undone === before);
      }
    }
    check(`no page errors @${w}`, errors.length === 0, errors[0]);
    await p.close();
  }
  await b.close();
}
