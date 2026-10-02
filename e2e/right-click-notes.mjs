// Notes open on right click. Pointing at something with a note only draws a small marker on its corner.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  {
    const { page, errors } = await open(browser, "schedule");
    const hdr = page.locator("section.bg-night").first();
    const note = page.locator("[data-hover-note], [role=tooltip]");
    const marker = page.locator("[data-note-marker]");
    const tile = hdr.getByRole("button", { name: /^Two places · 2/ });
    const tile2 = hdr.getByRole("button", { name: /^Not licensed · 1/ });

    await tile.hover();
    await page.waitForTimeout(450);
    check("pointing at a tile draws a marker and no note", (await marker.count()) === 1 && (await note.count()) === 0);
    check("the marker is in the problem colour", (await marker.getAttribute("data-note-marker")) === "bad");
    check("the marker doesn't take clicks", (await marker.evaluate((e) => getComputedStyle(e).pointerEvents)) === "none");
    await page.mouse.move(700, 160);
    await page.waitForTimeout(250);
    check("the marker goes when the pointer leaves", (await marker.count()) === 0);

    await tile.click({ button: "right" });
    await page.waitForTimeout(250);
    check("right click opens the note", (await note.count()) === 1 && /Two places/.test(await note.first().innerText()));
    await tile2.click({ button: "right" });
    await page.waitForTimeout(250);
    check("opening another leaves one note, the new one", (await note.count()) === 1 && /Not licensed/.test(await note.first().innerText()));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    check("Escape closes it", (await note.count()) === 0);
    await tile.click({ button: "right" });
    await page.mouse.click(760, 160);
    await page.waitForTimeout(250);
    check("a click elsewhere closes it", (await note.count()) === 0);

    // The big issue numeral draws no marker, but its note still opens on right click.
    const lead = hdr.locator('[data-tip-quiet]').first();
    await lead.hover();
    await page.waitForTimeout(450);
    check("the big header number draws no marker", (await marker.count()) === 0);
    await lead.click({ button: "right" });
    await page.waitForTimeout(250);
    check("right click on the big number still opens its note", (await note.count()) === 1);
    await page.keyboard.press("Escape");
    await page.mouse.move(700, 160);

    const cell = page.locator("#day-EST-6");
    await cell.scrollIntoViewIfNeeded();
    await cell.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    check("keyboard focus draws the marker, not a note", (await marker.count()) === 1 && (await note.count()) === 0);
    await page.keyboard.press("Shift+F10");
    await page.waitForTimeout(250);
    check("Shift+F10 opens the note", (await note.count()) === 1);
    await page.keyboard.press("Escape");

    // Text fields and plain text keep the browser's own menu.
    const prevented = await page.evaluate(() =>
      [["input", "x"], ["div", ""]].map(([tag, title]) => {
        const el = document.createElement(tag);
        if (title) el.title = title;
        el.textContent = "plain";
        document.body.appendChild(el);
        const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
        el.dispatchEvent(ev);
        el.remove();
        return ev.defaultPrevented;
      }),
    );
    check("a text field keeps the browser's right-click menu", prevented[0] === false);
    check("plain text keeps the browser's right-click menu", prevented[1] === false);
    check("no script errors", errors.length === 0, errors.join(" | "));
    await page.close();
  }
  {
    // Touch has no right click: a long press opens the note, and the click that ends the press does nothing else.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(`${process.env.BASE ?? "http://127.0.0.1:3002/spa.html"}#/schedule`);
    await page.waitForTimeout(900);
    const tile = page.locator("section.bg-night").first().getByRole("button", { name: /^Two places · 2/ });
    await tile.scrollIntoViewIfNeeded();
    const b = await tile.boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const pt = [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }];
    const before = await page.evaluate(() => location.hash);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
    await page.waitForTimeout(800);
    check("a long press opens the note", (await page.locator("[data-hover-note]").count()) === 1);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
    check("the press does not also act", (await page.evaluate(() => location.hash)) === before);
    await ctx.close();
  }
  await browser.close();
}
