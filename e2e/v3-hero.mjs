// The Schedule header explains the selected cell in words; blocks and list rows wear the colour of their issue; the left list can be hidden.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
const b = await launch();
const s = await serveV3();
const { page, errors } = await openApp(b, s.base, { practice: false });
await page.evaluate(() => { window.__v3.loadProblems(); window.__v3.app.getState().setView("wall"); });
await page.waitForSelector('[role="gridcell"]');
const hero = page.locator("section.hero-band");
const headline = () => hero.locator("[data-hero-headline]").innerText();
const rgb = (loc) => loc.evaluate((e) => getComputedStyle(e).backgroundColor);

check("nothing selected: the header says No cell selected", (await headline()) === "No cell selected" && (await hero.getAttribute("data-explain")) === "none");
check("the header has no buttons except the month dial area (no Fix, arrows, Someone's out)", (await hero.getByRole("button", { name: /Fix|Someone|Previous problem/ }).count()) === 0);

await page.getByRole("button", { name: "Open the list" }).click();
const left = page.locator('aside[aria-label="Left panel"]');
check("the left list has Queue and History only (no To tell)", (await left.getByRole("tab").allInnerTexts()).join() === "Queue,History");
await left.getByRole("button", { name: /See all/ }).click();
const rows = left.locator(".q-row");
check("list rows carry their severity", (await rows.locator("xpath=self::*[@data-sev='bad']").count()) > 0 && (await rows.locator("xpath=self::*[@data-sev='warn']").count()) > 0);
const bad = await rgb(left.locator(".q-row[data-sev='bad']").first());
const warn = await rgb(left.locator(".q-row[data-sev='warn']").first());
check("red rows and yellow rows have different colours", bad !== warn, `${bad} vs ${warn}`);

// a double booking: both cells are red and the header names the person and both stores
const dbl = left.locator(".q-row", { hasText: "Booked at two stores" }).first();
await dbl.click();
const h1 = await headline();
check("double booking headline says who and where", /is booked at two stores: [A-Z0-9]+ and [A-Z0-9]+/.test(h1), h1);
check("header chip is red for a broken rule", (await hero.getAttribute("data-explain")) === "bad");
const sel = await page.evaluate(() => window.__v3.app.getState().selection);
const pid = await page.evaluate((s) => Object.values(window.__v3.app.getState().world.state.assignments).filter((a) => a.date === s.date).map((a) => a.pharmacistId).filter((p, i, all) => all.indexOf(p) !== i)[0], sel);
const cells = page.locator(`.w-cell[data-date="${sel.date}"][data-icon="double"]`);
check("every cell of the double booking shows the red block", (await cells.count()) >= 2 && (await rgb(cells.first().locator(".w-block"))) === "rgb(240, 196, 186)", `${await cells.count()} ${await rgb(cells.first().locator(".w-block"))}`);
void pid;
check("the header adds full sentences of context under the headline", (await hero.locator("[data-hero-detail] p").count()) >= 1 && (await hero.getByRole("list", { name: "People involved" }).count()) === 0);
check("the headline is centred and large", (await hero.locator("[data-hero-headline]").evaluate((e) => getComputedStyle(e.parentElement).textAlign === "center" && parseFloat(getComputedStyle(e).fontSize) >= 30)));

// a warning: yellow block, yellow header chip, plain words
const drive = left.locator(".q-row[data-sev='warn']", { hasText: "min drive" }).first();
await drive.click();
const h2 = await headline();
check("long drive headline names the person, the store and the minutes", /has a long drive to [A-Z0-9]+ \(\d+ minutes\)/.test(h2), h2);
check("header chip is yellow for a warning", (await hero.getAttribute("data-explain")) === "warn");
const wsel = await page.evaluate(() => window.__v3.app.getState().selection);
const wcell = page.locator(`.w-cell[data-date="${wsel.date}"][data-store="${wsel.storeId}"] .w-block`);
check("the cell block is yellow", (await rgb(wcell)) === "rgb(242, 218, 143)", await rgb(wcell));

// needs cover
await left.locator(".q-row", { hasText: "needs 1 more" }).first().click();
const h3 = await headline();
check("open shift headline says what is missing", /needs 1 more pharmacist/.test(h3), h3);

// a covered cell with no issue
const good = page.locator('.w-cell[data-block="good"]:not([data-icon])').nth(40);
await good.click();
check("a fine cell says Covered", /is covered/.test(await headline()) && (await hero.getAttribute("data-explain")) === "ok", await headline());

// the same issue is never said twice: across every cell that has a problem, no line repeats and a very long drive does not also say "long drive"
{
  const cells = await page.locator('.w-cell[data-icon]:not([data-icon="covering"]):not([data-icon="short"])').evaluateAll((els) => els.slice(0, 60).map((e) => ({ store: e.dataset.store, date: e.dataset.date })));
  let bad = "";
  for (const c of cells) {
    if (!c.store) continue;
    await page.locator(`.w-cell[data-store="${c.store}"][data-date="${c.date}"]`).click();
    const lines = [await headline(), ...(await hero.locator("[data-hero-detail] p").allInnerTexts())].map((x) => x.trim()).filter(Boolean);
    const dupe = lines.find((l, i) => lines.indexOf(l) !== i);
    const drive = lines.filter((l) => /long drive/i.test(l));
    if (dupe || drive.length > 1) { bad = `${c.store} ${c.date}: ${dupe ?? drive.join(" | ")}`; break; }
  }
  check(`no issue is repeated in the header (${cells.length} cells checked)`, bad === "", bad);
}

// hide the list
await left.getByRole("button", { name: "Close the list" }).click();
check("Hide closes the left list", (await page.locator('aside[aria-label="Left panel"]').count()) === 0);
check("no console errors", errors.length === 0, errors.join(" | "));
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
