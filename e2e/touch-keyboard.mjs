import { launch } from "./lib.mjs";
const BASE="http://127.0.0.1:3002/spa.html";
const b = await launch(); const res=[]; const ok=(c,m)=>{res.push((c?"ok   ":"FAIL ")+m);};
// touch: two-tap on grid
{ const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const p=await ctx.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  await p.goto(BASE+"#/"); await p.waitForTimeout(800);
  const cell=p.locator('[data-rc="3|8"]'); await cell.scrollIntoViewIfNeeded();
  await cell.tap(); await p.waitForTimeout(300);
  ok((await p.locator('[role="tooltip"]').count())===1,"touch: first tap shows the note");
  ok(!/schedule/.test(p.url()),"touch: first tap does not navigate");
  await cell.tap(); await p.waitForTimeout(600);
  ok(/schedule/.test(p.url()),"touch: second tap opens the day");
  ok((await p.getByRole("dialog").count())>=0,"touch: day opens");
  ok(errs.length===0,"touch: no errors "+errs.join());
  // tapping a different cell then back
  await p.goto(BASE+"#/"); await p.waitForTimeout(600);
  const a=p.locator('[data-rc="3|8"]'), c=p.locator('[data-rc="5|10"]'); await a.scrollIntoViewIfNeeded(); await a.tap(); await c.tap(); await p.waitForTimeout(200);
  ok(!/schedule/.test(p.url()),"touch: tapping another cell moves the note, does not open");
  await ctx.close(); }
// desktop: note stuck after route change / scroll / escape
{ const ctx=await b.newContext({viewport:{width:1366,height:900}}); const p=await ctx.newPage();
  await p.goto(BASE+"#/"); await p.waitForTimeout(800);
  await p.locator('[data-rc="3|8"]').click({button:"right"}); await p.waitForTimeout(200);
  ok((await p.locator('[role="tooltip"]').count())===1,"desktop: right click shows the note");
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  ok((await p.locator('[role="tooltip"]').count())===0,"desktop: Escape closes the note");
  await p.locator('[data-rc="3|8"]').click({button:"right"}); await p.getByRole("link",{name:"Print"}).first().click().catch(()=>{}); await p.waitForTimeout(600);
  ok((await p.locator('[role="tooltip"]').count())===0,"desktop: no note left over after navigating");
  // global tips: native title removed and data-tip present, no duplicate native tooltips
  await p.goto(BASE+"#/people"); await p.waitForTimeout(600);
  await p.locator('tbody button[aria-label^="Edit"]').first().click({button:"right"}); await p.waitForTimeout(200);
  const t=await p.locator('div.fixed[role="presentation"]').count();
  ok(t===1,"desktop: icon button shows one note ("+t+")");
  ok((await p.locator('tbody button[aria-label^="Edit"]').first().getAttribute("title"))===null,"desktop: native title removed");
  // keyboard on grid
  await p.goto(BASE+"#/"); await p.waitForTimeout(600);
  await p.locator('[data-rc="0|0"]').focus(); for (const k of ["ArrowRight","ArrowDown","ArrowDown","End","Home"]) await p.keyboard.press(k);
  const rc=await p.evaluate(()=>document.activeElement?.getAttribute("data-rc"));
  ok(rc==="2|0","keyboard: arrows/Home/End move focus (at "+rc+")");
  await p.keyboard.press("Enter"); await p.waitForTimeout(500);
  ok(/schedule/.test(p.url()),"keyboard: Enter opens the day");
  await ctx.close(); }
console.log(res.join("\n")); await b.close();
