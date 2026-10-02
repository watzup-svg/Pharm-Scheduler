// `npm run e2e` (serve the built app first: `npx vite build -c vite.spa.config.ts && npx http-server dist-spa -p 3002`).
import { failed } from "./lib.mjs";
import smoke from "./smoke.mjs";
import timeoff from "./timeoff.mjs";
import print from "./print.mjs";
import pages from "./pages.mjs";
import dialogs from "./dialogs.mjs";
import fit from "./fit.mjs";
import cover from "./cover.mjs";
import phase1 from "./phase1.mjs";
import marks from "./marks.mjs";
import hoverRules from "./hover-rules.mjs";
import navigator from "./navigator.mjs";
import nextMonth from "./next-month.mjs";
import miniMonth from "./mini-month.mjs";

for (const [name, fn] of [["smoke", smoke], ["time off", timeoff], ["print", print], ["pages", pages], ["dialogs", dialogs], ["fit", fit], ["cover plans", cover], ["daily jobs", phase1], ["marks", marks], ["hover rules", hoverRules], ["issue navigator", navigator], ["next month", nextMonth], ["small month", miniMonth]]) {
  console.log(`\n# ${name}`);
  await fn();
}
console.log(failed() ? `\n${failed()} check(s) failed` : "\nall checks passed");
process.exit(failed() ? 1 : 0);
