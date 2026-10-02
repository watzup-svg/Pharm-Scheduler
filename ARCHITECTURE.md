# Where things live

Single-user, offline, pharmacist-only month scheduler. React 19, TanStack Router (hash), Tailwind v4, Zustand. One HTML file per build.

## Rules that must hold
- **No auto-scheduler.** Nothing places a name unless a person asked.
- **`placeName` (`src/lib/schedule/place.ts`) is the only write gate** for names in the grid. Drag, swap, bulk and paste all go through it.
- **`src/lib/schedule/` is pure**: no React, no browser. Rules, wording of problems, print model, file format all live here and are tested without a browser.
- **Hard problems block printing** (open store-day with nobody, same person at two stores one day, name on a closed day, not licensed in that state). One answer: `gate.ts`.
- **Letters are a store's identity in the file; the display name is `storeTag` / `useStoreTag`** (number or letters, the district's choice). Never print `store.code` on screen. `store-letters.test.ts` fails if a screen does.
- Don't change rules unless asked.

## Map
| You want to change | Look in |
|---|---|
| A rule, or who counts as a problem | `lib/schedule/rules.ts`, `dashboard.ts`, `district.ts` (one look per store-day) |
| Fix-it steps and their sentences | `lib/schedule/fix.ts` (kinds: hole, double, leftover, license) |
| The issue cursor (arrows, Fix button) | `lib/schedule/issue-cursor.ts`, `components/issue-nav.tsx` |
| Header: tiles, buttons, ring, day strip | `components/status-strip.tsx`, `hero-graphics.tsx` (ring), `header-links.tsx` (hover links), `issue-nav.tsx` |
| Hover notes (popups) | `components/hover-note.tsx` (look), `hover-tips.tsx` (anything with `data-tip`/`title`). Markup: `data-tip="Title \| line \| Open this day"`, `data-tip-tone`, `data-tip-mark`, `data-tip-place="below"` |
| Marks and their colours | `components/marks.tsx` (`MARKS`), tokens in `styles.css` |
| Wording | `artifacts/COPY_GUIDE.md`; sentences live next to the code that shows them |
| Month grid (District) / store calendars / week / day | `month-grid.tsx` / `store-calendar.tsx` / `week-board.tsx` / `day-board.tsx`; shared per-day facts: `day-view.ts` |
| Day panel (click a day) | `day-sheet.tsx` (panel + problem notices), `day-sheet-slot.tsx` (one slot), `day-sheet-picker.tsx` (who can cover), `day-sheet-extras.tsx` (not-offered list, impact list, out button) |
| Printing | `lib/schedule/print-model.ts` (what), `pdf.ts` (PDF), `components/print-screen.tsx`, `letter-sheet.tsx` (on-screen preview) |
| Saved file (format, old versions) | `lib/schedule/file.ts` (zod schema, v1 files expand on open) |
| All app state and actions | `store/schedule-store.ts` (document), `store/view-store.ts` (UI only: selected issue, hover) |
| Sample month | `lib/schedule/demo.ts` (used by the trial build; the real build opens empty) |

## Recipes
- **Rename a label**: change the string where it renders; if it appears in several places, `grep` the old text, then update `artifacts/COPY_GUIDE.md`.
- **Tweak a popup**: add or edit `data-tip` on the element; tone and mark come from `data-tip-tone` / `data-tip-mark`. Don't nest two noted elements (e2e "no note inside another note" fails).
- **Show a store anywhere**: `const tag = useStoreTag(); tag(code)`. In pure code: `storeTag(doc, code)` from `lib/schedule/label.ts`.
- **Rename or reorder a problem kind**: `lib/schedule/problem-kinds.ts` (names and list order); tiles, print tiles, the issue titles, the grid legend, marks and the next-month summary all read from it.
- **Add a problem type**: add it to `problem-kinds.ts`, the evaluation in `rules.ts`, a step in `fix.ts`, a mark in `marks.tsx`, its colours in `problem-row.tsx` and `day-view.ts`, and the print gate in `gate.ts`. Type errors on the `Record<…>` tables will point at what is missing.
- **Add a saved setting**: make it optional in `file.ts` so old files still open, add a test that opens an older file.

## Checking your change
- `npm run check`: type check + unit tests (about 10 s). Run after each edit.
- `npm run e2e -- header-links`: one browser check by name (see `e2e/run.mjs` for names). Serve first: `python3 -m http.server 3002 -d dist-spa` after `npm run build:trial`.
- `npm run e2e`: the whole browser suite; once per batch. CI runs the same on every PR.
- Look at the spot you changed (a screenshot or a hover probe); don't re-check untouched pages.
- Not covered by any test: real printers, iPhone Safari, real touch, real road times.

- Everything at once: `npm run all` (or `npm run deep` for the long version); pieces are in `scripts/` (`guards.mjs`, `sweep.mjs`, `screens.mjs`, `builds.mjs`). Details: `e2e/README.md`.

## Builds
`npm run build:trial` -> `dist-spa/spa.html` (opens on the fictional sample month). `npm run build:real` -> `dist-real/spa.html` (empty, Welcome screen). Neither is committed; CI attaches both to each run.
