# Where things live

New here? Start with [README.md](README.md) and [REVIEW_GUIDE.md](REVIEW_GUIDE.md) (for an outside reviewer). This file is the map of where each piece of code lives.

Single-user, offline, pharmacist-only month scheduler. React 19, TanStack Router (hash), Tailwind v4, Zustand. One HTML file per build.

## Rules that must hold
- **No auto-scheduler.** Nothing places a name unless a person asked.
- **`placeName` (`src/lib/schedule/place.ts`) is the only write gate** for names in the grid. Drag, swap, bulk and paste all go through it.
- **`src/lib/schedule/` is pure**: no React, no browser. Rules, wording of problems, print model, file format all live here and are tested without a browser.
- **Hard problems block printing** (open store-day with nobody, same person at two stores one day, name on a closed day, not licensed in that state). One answer: `gate.ts`.
- **Letters are a store's identity in the file; the display name is `storeTag` / `useStoreTag`** (number or letters, the district's choice). Never print `store.code` on screen. `house-rules.test.ts` fails if a screen does.
- **Press-and-hold only when there is no undo.** An action that can be undone (a store/person/holiday/time-off removal, clearing a day, fills, leave-as-is, approvals) is a plain click that calls `announce()` (Undo toast, also Ctrl+Z). `HoldButton` (`components/ui/hold-button.tsx`) is only for an action nothing can undo, and each use carries a `// no-undo: <what is lost>` comment. `house-rules.test.ts` fails otherwise. Today no screen needs one.
- Don't change rules unless asked.

## Map
| You want to change | Look in |
|---|---|
| A rule, or who counts as a problem | `lib/schedule/rules.ts`, `dashboard.ts`, `district.ts` (one look per store-day) |
| Fix-it steps and their sentences | `lib/schedule/fix.ts` (kinds: hole, double, leftover, license) |
| The issue cursor (arrows, Fix button) | `lib/schedule/issue-cursor.ts`, `components/issue-nav.tsx` |
| Header: tiles, buttons, ring, day strip | `components/status-strip.tsx`, `hero-graphics.tsx` (ring), `header-links.tsx` (hover links), `issue-nav.tsx` |
| Notes (popups). Open on right click / Shift+F10 / long press; hover only draws a small marker | `components/hover-note.tsx` (look, marker, long press), `hover-tips.tsx` (anything with `data-tip`/`title`). Rich notes built in code (`useNote`): month grid, ring. Markup: `data-tip="Title \| line \| Open this day"`, `data-tip-tone`, `data-tip-mark`, `data-tip-place="below"` |
| The Time off page: filters, queue, slip, month | `components/time-off-screen.tsx` (page), `time-off-requests.tsx` (To approve queue and slip), `time-off-list.tsx` (Approved and Declined rows), `time-off-month.tsx` (the one month), `time-off-day.tsx` (a day's details), `time-off-add.tsx` (drawer); data in `lib/schedule/timeoff-view.ts` |
| Marks and their colours | `components/marks.tsx` (`MARKS`), tokens in `styles.css` |
| Wording | `artifacts/COPY_GUIDE.md`; sentences live next to the code that shows them |
| Month grid (District) / store calendars / week / day | `month-grid.tsx` / `store-calendar.tsx` / `week-board.tsx` / `day-board.tsx`; shared per-day facts: `day-view.ts` |
| Day panel (click a day) | `day-sheet.tsx` (panel + problem notices), `day-sheet-slot.tsx` (one slot), `day-sheet-picker.tsx` (who can cover), `day-sheet-swap.tsx` (swap with another booked person), `day-sheet-extras.tsx` (not-offered list, impact list, out button) |
| Printing | `lib/schedule/print-model.ts` (what), `pdf.ts` (PDF), `components/print-screen.tsx`, `letter-sheet.tsx` (on-screen preview) |
| Saved file (format, old versions) | `lib/schedule/file.ts` (zod schema, v1 files expand on open) |
| Fill suggestions (who can cover a hole, ranking, chains, leave-closed card) | `lib/schedule/plan-preview.ts` (dry run of one plan on a copy: month holes before and after), `lib/schedule/cover-plan.ts` (planner: up to 3 moves, 150-minute cap, away-count tiebreak), `suggest.ts`, `hints.ts`; tests `fill-cases.test.ts`, `fill-robust.test.ts`, `npm run fill` |
| Mileage pay (cost math, IRS rate, miles per store pair) | `lib/schedule/mileage.ts`, `lib/schedule/drive-table.ts` (the measured Google Maps miles and minutes for all 120 store pairs, used before the estimate), `lib/schedule/new-store.ts` + `components/new-store-distances.tsx` (the collapsed "add distances" notice for a store without measured ones), `lib/schedule/miles-import.ts` (pasted "CODE,CODE,miles" lines), `pairMiles` in `geo.ts`; used by `cover-plan.ts` and `suggest.ts`; screen in `components/drive-times.tsx` |
| Test-only stores (Scappoose and West Linn, closed, kept for tests built around them) | `lib/schedule/test-stores.ts` |
| All app state and actions | `store/schedule-store.ts` (document), `store/persistence.ts` (what this browser keeps: backups, archive, autosave), `store/view-store.ts` (UI only: selected issue, hover) |
| Sample month | `lib/schedule/demo.ts` (used by the trial build; the real build opens empty) |

## Recipes
- **Rename a label**: change the string where it renders; if it appears in several places, `grep` the old text, then update `artifacts/COPY_GUIDE.md`.
- **Tweak a popup**: add or edit `data-tip` on the element (it opens on right click, so test with `rightClick()` from `e2e/lib.mjs`); tone and mark come from `data-tip-tone` / `data-tip-mark`. Don't nest two noted elements (e2e "no note inside another note" fails).
- **Show a store anywhere**: `const tag = useStoreTag(); tag(code)`. In pure code: `storeTag(doc, code)` from `lib/schedule/label.ts`.
- **Rename or reorder a problem kind**: `lib/schedule/problem-kinds.ts` (names and list order); tiles, print tiles, the issue titles, the grid legend, marks and the next-month summary all read from it.
- **Add a problem type**: add it to `problem-kinds.ts`, the evaluation in `rules.ts`, a step in `fix.ts`, a mark in `marks.tsx`, its colours in `problem-row.tsx` and `day-view.ts`, and the print gate in `gate.ts`. Type errors on the `Record<…>` tables will point at what is missing.
- **Add a saved setting**: make it optional in `file.ts` so old files still open, add a test that opens an older file.

- **Add a page**: add a file in `src/routes/` (copy a small one such as `lists.tsx`); the build regenerates `src/routeTree.gen.ts` itself, so commit that file with it. `src/main.tsx` is the entry, `src/routes/__root.tsx` the shell, `vite.spa.config.ts` the only build config (`npm run dev` serves it on :3000).

## Checking your change
- `npm run check`: type check + unit tests (about 10 s). Run after each edit.
- `npm run e2e -- header-links`: one browser check by name (see `e2e/run.mjs` for names). Run `npm run build:trial` first; the runner serves the build itself.
- `npm run e2e`: the whole browser suite; once per batch. CI runs the same on every PR.
- Look at the spot you changed (a screenshot or a hover probe); don't re-check untouched pages.
- Not covered by any test: real printers, iPhone Safari, real touch. Road times and miles come from a measured table (`lib/schedule/drive-table.ts`), not a live map. Counts today: 372 unit tests (`npm run check`); the browser suite is the groups listed in `e2e/run.mjs`.

- Everything at once: `npm run all` (or `npm run deep` for the long version); pieces are in `scripts/` (`guards.mjs`, `sweep.mjs`, `screens.mjs`, `builds.mjs`). Details: `e2e/README.md`.

## Builds
`npm run build:trial` -> `dist-spa/spa.html` (opens on the fictional sample month). `npm run build:real` -> `dist-real/spa.html` (empty, Welcome screen). Neither is committed; CI attaches both to each run.
