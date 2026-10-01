# Hi-School Pharmacy scheduler: continue-the-build handoff

Snapshot 2026-10-02, build v86. This supersedes `handoff/README.md` (kept for history; some of it is out of date). Status when packaged: typecheck clean, 272/272 rules tests, the full browser suite passes ("all checks passed").

## 1. What this is
A single-user, offline, pharmacist-only month scheduler for ONE person: the district manager of Hi-School Pharmacy (about 18 stores in Oregon and Washington). **A human decides who covers each shift. There is no auto-scheduler and there must never be one.** The app shows problems, who is free, and what each choice would break, and prints a PDF packet the stores post. She uses a phone and a laptop and is not technical. It is delivered as one self-contained HTML file (`dist-spa/spa.html`).

## 2. Rules that must never be broken
- **Hard problems (block printing):** an open store-day with nobody; the same pharmacist at two stores on one date; a name left on a closed day; a pharmacist not licensed in that state.
- **Warnings only:** time off, covering away from home, "left as is".
- Time off is **separate dates**, not a from-to range. A date drops when that person's home store is closed.
- Floats keep a home store. A stamp must not overwrite a filled cell. A doubled person is one day worked.
- Next month carries by **weekday occurrence**, not date number. v1 files still open. Addresses stay.
- Nothing assigns a pharmacist by itself. A proposal may suggest; she confirms.
- The only write gate is `placeName` in `src/lib/schedule/place.ts`. The rules engine in `src/lib/schedule/*` is pure; do not change rules without being asked.

## 3. Stack and how to run
React 19, TanStack Start/Router (hash-history SPA), Tailwind v4, Zustand (`store/schedule-store.ts` document, undo and autosave; `store/view-store.ts` UI state), Radix Dialog/Dropdown, sonner, jsPDF, zod.
- Install: `npm install`. Typecheck: `npx tsc --noEmit -p .`
- Rules and store tests: `npm run test:schedule` (272 pass, includes fuzz).
- Build the single file: `npx vite build -c vite.spa.config.ts` (output `dist-spa/spa.html`). Serve: `python3 -m http.server 3002 -d dist-spa`, open `/spa.html`. The harness loads the practice month (October 2026) on a first visit (`harness/spa/main.tsx`); the key `hischool-trial-demo-v1` suppresses that.
- Browser suite: `npm run e2e` (Playwright and Chromium, needs the server on :3002; see `e2e/README.md`). Suites: smoke, time off, print, pages, dialogs, fit (every page at 320 to 1366 px plus header sizes), cover plans, daily jobs, marks, hover rules. Extra: `stress/engine.ts` (scale and hostile files), `stress/monkey.mjs` (random clicking), `stress/targeted.mjs` (big document, bad storage).
- Not testable by the previous builder: Safari/iOS, a real printer, the File System Access picker, real touch and long-press, downloads from hosted viewers.

## 4. Where things are
- `src/lib/schedule/` rules and models (pure, tested). Key: `rules.ts` (evaluate), `place.ts`, `dashboard.ts` (`choicesFor`, `monthStatus`), `fix.ts` (problems as steps with headlines), `suggest.ts` (ranking), `cover-plan.ts` (shorter-drives planner: lowest-cost matching, 2 h drive limit, never leaves a store bare), `insight.ts` (spare-people pressure, person month strips, store runs), `geo.ts` (drive estimates; Columbia River crossings routed through bridges), `thin.ts`, `workload.ts`, `second-look.ts`, `print-model.ts`, `pdf.ts`, `file.ts` (parse/serialize, v1 expands ranges to dates), `next-month.ts`.
- `src/components/` UI. Key: `marks.tsx` (all state marks), `hero.tsx` and `page-strip.tsx` (the header template), `status-strip.tsx` (District and Schedule header), `hero-graphics.tsx` (month ring, mini calendar, rings, bars, paper stack), `month-grid.tsx` (district grid and legend), `store-calendar.tsx`, `day-sheet.tsx` (the day panel), `cover-plans.tsx`, `person-strip.tsx`, `district-more.tsx` and `month-checklist.tsx`, `hover-tips.tsx` and `hover-note.tsx`, `ui/` (button variants, dialog, action-bar).
- `e2e/` browser checks; `stress/` stress scripts; `artifacts/` guides and data; `harness/` build stubs for the single-file build.

## 5. House conventions (all are checked by tests where noted)
- **One mark system.** `StateMark` in `marks.tsx`: a rounded-square chip with a picture. Families: problem (light red `#efd8d2`, brick `#8c3a2f`), away (yellow `#f4e2a3`, brown `#7a4e08`, palm tree), cover (green `#dcebe2`, route arrows), neutral (grey: closed, left as is). Four sizes only: 16, 20, 24, 28. No circles. (`e2e/marks.mjs`)
- **Theme by subject.** Anything about someone being off is yellow with the palm tree: marks, tiles, the `away` button variant, the nav badge. Cards about one subject get `accent-away`/`accent-problem`/`accent-cover` (a left-edge tab and glow). See `artifacts/STYLE_GUIDE.md`, "Theme by subject".
- **Header template.** Every page header is built by `HeroLayout`: lead numeral, tiles row, actions row, one picture in a fixed box. Same size on every page (272 px laptop, 400 px phone). (`e2e/fit.mjs`)
- **Hover notes.** One note per spot, `Title | line | line`, nearest wins, a control never borrows its card's note, richer notes mark `data-notip`. Words on screen are minimal; hover carries the "why". (`e2e/hover-rules.mjs`)
- **Copy.** `artifacts/COPY_GUIDE.md` is the standard: neutral labels, warm guidance, one name per idea, length budgets. **Names:** full name when it fits; otherwise first initial and whole last name ("M. Quenby"); cut with an ellipsis if it still overflows. Only `shortNames` in `components/day-view.ts` shortens names.
- **Safety UX.** Undo stack (50 snapshots), press-and-hold buttons for irreversible one-shots, print gating. Marking is by shape and picture, never colour alone.

## 6. What changed most recently (so you know the shape of the code)
Day panel fit on phones (`ui/action-bar.tsx`); spare-people bar over each grid day; person month strips and store run lines; shorter-drives cover plans in the day panel; one header template; one mark system; the "someone is off" theme; checklist reworked into five steps with a labelled summary; hover-note conflicts fixed; storage-blocked fallback (`lib/safe-storage.ts`); faster District grid (grid labels no longer build the heavy "who is free" note at render).

## 7. Backlog, in order
1. **Issue navigator in the header (designed, not built).** Phase A: a shared "selected day" (open panel day, else the current issue's day) drives the month ring: the white tick rotates to it and the center reads "OCT 6th 2026"; today becomes a small dot on the rim. Arrows either side of the big issue count step through issues (stable issue key, date order, wraps); a short title names the issue ("No coverage · Rick's · Wed Oct 21"); stepping highlights the cell and does not open the panel; the Day panel's "Next · N" uses the same cursor. Phase B: per-issue details and up to three choices with a previewed ramification (dry-run on a copy using the existing write gate and `evaluate`: new count, what is fixed, what breaks), then Apply as one undo step. Open questions for the owner: keep the big number as total issues (recommended), keep a today dot (recommended), stepping highlights only (recommended), add a weekday under the date.
2. **Wording review (plan agreed, Phases 1 and 2 done).** Phase 3: extract every user-visible string (on screen, hover, accessible names, toasts, dialogs, print) into one table with proposed wording and reasons, shown to the owner by screen before any code changes (order: District, Schedule and the day panel, Time off, Print, People and Stores, Holidays, Setup and File, dialogs and toasts, the print poster last). Phase 4: apply in small batches with a copy-lint test (banned words, length budgets, curly apostrophes). Banners and pills still use first names; move them to the name rule.
3. **UX audit features, not yet built:** swap two pharmacists in one step; show drive minutes on green cells in placing mode; count shifts after someone's last day (decide: warning like time off, recommended); move a pharmacist to another store for a date range with backfill and one undo (the large one).
4. **Drive times.** `artifacts/DRIVE_TIMES_CHECK.md` lists estimates (straight line x 1.3 at 45 mph, bridge-routed across the Columbia). None has been checked against real roads (no map service was reachable). The owner should enter real times for the pairs that matter under Setup, Stores, Drive times; entered times win and lose the "~".
5. **Checklist steps 1 and 2** ("people and stores up to date", "holidays right") are still "I checked" buttons; making them real checks needs the owner to define "up to date".
6. Optional: apply `accent-problem` to day-panel problem banners and `accent-cover` to the cover cards.

## 8. Known gaps
Never used by the real district manager; real rules beyond licensing (max days in a row, weekend rotation) are unknown; iOS Safari and real touch unverified; the phone call link once caused a white screen and was replaced by a Call/Copy sheet (reasoned, not reproduced); downloads are blocked in hosted viewers; the File System Access picker is untested.

## 9. How to work on this
- For anything larger than a small fix, say the plan first and wait for approval. The owner often asks for "strategy only, no changes".
- Make one change set at a time. After each: typecheck, `npm run test:schedule`, rebuild, `npm run e2e`. Update tests that depend on changed wording or structure in the same change.
- Verify by looking: screenshot desktop (1366) and phone (390). Do not report mid-page tab bars or blank calendar cards in full-page screenshots as bugs (screenshot artifacts).
- Report plainly: what changed, what was checked, what was not. Do not claim anything about real roads, printers or iOS that was not tested.
- Never kill processes by pattern; kill by exact id. The static server dies when the container restarts; restart it.
