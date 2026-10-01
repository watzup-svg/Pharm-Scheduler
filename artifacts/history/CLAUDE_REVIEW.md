# Claude Code review prompt

Paste the prompt below into Claude Code after unzipping this archive next to the existing app, or after opening the included `src/` tree. This zip is the scheduler as of 2026-09-30 after the pharmacist-only cleanup and a first layout pass. It replaces `HiSchool_Pharmacy_Scheduler_source_2026-09-30.zip`, which is the earlier snapshot.

Included: `src/components`, `src/lib/schedule`, `src/store`, `src/routes`, `src/styles.css`, `src/router.tsx`.
Omitted on purpose: `node_modules`, auth, database, and the Grok preview shell. Do not recreate those. Do not treat their absence as a bug.

---

You are reviewing and then improving the Hi-School Pharmacy scheduler. It is a single-user month editor for a district manager who schedules pharmacists only. It is not an auto-scheduler and it is not a spreadsheet. The human decides who covers a hole. The app shows the hole, who is free, and what would break. It never assigns a person by itself.

File format: `hischool-schedule` version 2. Keep loading version 1 files. Snapshot under review: 2026-09-30.

A new UI is allowed. Replace the layout, navigation, and visual design, including `month-grid.tsx`, when the replacement is clearly better at the six jobs below on both a phone (390×844) and a laptop. A reskin that does not make those jobs shorter is not worth shipping. Keep the pine / cream / paper palette unless a new palette is calmer and still obvious about holes (red), time off (yellow), and closed days.

The rules engine is not optional. Do not rewrite `src/lib/schedule` to fit a new screen. Call it.

## What success looks like

A district manager builds one month of pharmacist coverage across several Hi-School stores, sees problems immediately, fills the usual pattern without overwriting hand edits, and prints a packet the stores can post.

Walk these jobs on a phone and on a laptop before you change anything, and again after. Use the September 2026 sample.

1. Tell whether this month is ready, and what is still wrong.
2. Find one open shift and place a pharmacist. Undo it.
3. Jump to today, to one store, and to one person.
4. Check time off and holidays, then get back to the same place on the grid.
5. Open Print, then return to the schedule.
6. Save, and find Open, without hunting.

September 2026 lessons that must stay true. A change that breaks one of these is a bug:

- Jane Smith is doubled on Molalla on the 4th (also on Estacada that day).
- Estacada the 16th is an open day with no pharmacist. That is a hole, not a warning.
- Jane's time off is several dates, not one from–to range. Dates that fall on her home store's closed day are dropped.
- Floats have a real home store. Working anywhere else is marked cover. Cover is not a hard error.
- A name left on a closed day is a hard error.
- The same pharmacist in two places on the same date is a hard error. Do not count that person as two days worked.
- Yellow time off still prints. It must not block the packet.
- Stamps and fills do not overwrite a cell that already has a name.
- Next month copies by weekday occurrence (first Monday to first Monday), not by day number.
- Home page is pharmacists only. There is no technician or cashier row, route, or print line.

## How the code is shaped

- Pure rules live in `src/lib/schedule`. UI must not reimplement holes, doubles, leftovers, PTO filtering, stamps, or next-month carry.
- `placeName` in `src/lib/schedule/place.ts` is the single write gate for a name in a cell.
- `src/store/schedule-store.ts` owns edits, undo, and autosave.
- `src/components/month-grid.tsx` is the current schedule. It is too large. Replace or split it if that makes the six jobs faster. Delete dead `mode === "staff"` branches. Do not resurrect a staff page.
- Routes today: `/` schedule, `/time-off`, `/holidays`, `/print`, `/people`, `/stores`. `/lists` redirects to `/people`. You may change routes if the new navigation is shorter. Keep Print, the month editor, people, stores, holidays, and time off reachable.
- The current chrome is a baseline, not a constraint. You may drop the problem-card-first layout, the two-row nav, and the stats buried under the grid.

What must survive a new UI, because these are the product, not the chrome:

- Save stays one tap away. Open is in the same File place.
- Undo works after a placement.
- A hole, a double, and a name on a closed day are visually distinct from time off and from “cover.”
- Tapping a problem lands on that cell, ready to edit.
- Fills and the typical week do not overwrite a filled cell.
- Phone: no horizontal page scroll. The month may scroll inside its own region. Targets at least 44px.

## Dashboard

The current “dashboard” is four counts (covered, holes, doubles, time off) plus a Today row, and it sits under the grid where it does not help. Replace it with a dashboard that is the front door of the month.

It has to answer these without making the person scan the grid first. Every row is a tap that goes to the cell, the person, or the right page. If a number cannot be tapped through to the cause, do not show it.

- Ready or not. If not, the next problem in one sentence, then the one after it. Not a second copy of the whole queue.
- Today, one line per open store: who is there, or that nobody is. Closed stores stay quiet.
- Who is off this month, and whether they are still sitting on a shift those days.
- The next hole: which store, which date, and which pharmacists are actually free. Show that placing someone would create a double. Do not place them. The person taps a name only as a choice, and can undo.
- Workload for the month: days worked and Saturdays, home store, next time off. A doubled person counts once that day.
- Days where more stores are open than pharmacists available.
- When the hard problems are clear, one action: open the print pack. Time off still listed, marked as printable.

Put this dashboard where it is the first thing on the schedule, including on a phone. The month grid stays one tap away and must not be buried under a report. On a laptop the dashboard can sit beside the month. On a phone it is the top of the schedule, short enough that the first store row is still on the first screen, or it is a sheet the person can collapse in one tap after they have seen it.

Do not add charts, trends, or a second app. Do not restate every cell.

## Review, then edit

Write a short review first. For each finding: what is hard, which of the six jobs it blocks, the file, the change you will make, and what you will leave alone. Rank by how much it slows those jobs. Then say whether you are replacing the UI or editing it, and why the new one is shorter for those jobs.

Then build it. Prefer one clear path over new menus.

Also look at:

- Labels a scheduler would not say. Internal words still in the UI: slot, rail, stencil, ghost, peek, cheat, RPh2 if a plainer “second pharmacist” fits without breaking data.
- Touch targets under 44px, horizontal page scroll, and controls trapped under the sticky header.
- Print gating. Holes, doubles, and leftover names block the PDF. Time off does not.
- Tests. They live beside the lib files. Run them. Add a test when you change a rule. Do not weaken a test to go green.

## Do not

- Put technicians or cashiers back.
- Auto-fill holes or build a solver. The dashboard may offer a name. It must not apply that name by itself.
- Make a spreadsheet the primary UI.
- Turn time off back into a single from–to range.
- Remove home store from floats, or remove store addresses.
- Drop version-1 file loading.
- Overwrite a filled cell during a stamp or fill.
- Treat covering, yellow time off, or a solo float as a hard error.
- Count a doubled person as two days worked.
- Carry next month by day number.
- Change auth, the database, or the “Created with Grok” chrome.
- Add a tutorial or coach marks.

## Verify

Schedule tests (the npm `test` script does not run these):

```
node --experimental-strip-types --test src/lib/schedule/*.test.ts src/store/schedule-store.test.ts
```

Then `npm run typecheck`. If you can run the app, walk the six jobs on 390×844 and on a laptop. From the dashboard, without scrolling the grid, name the next problem, who is free for it, and who is off. Confirm Jane is still a double on Molalla the 4th and Estacada the 16th is still a hole.

Done when a scheduler can answer “is this month ready?”, fix one hole, check time off, and reach Print without learning the layout, the dashboard is the reason they know, and the September lessons still pass.
