# Review guide

For an outside reviewer (human or AI). About 10 minutes to orient.

## What this is
A month scheduler for pharmacists only, used by one non-technical district manager across about 16 stores. She picks who works where each day; the app flags problems and ranks options. Output is a printed or PDF packet. Everything runs in the browser and saves to a local file.

## What it deliberately is not
- **Not an auto-scheduler.** Nothing places a name unless a person asked. Fill suggestions only propose; she confirms.
- **The rules engine is pure.** `src/lib/schedule/` has no React and no browser code and is tested without one.
- **`placeName` (`src/lib/schedule/place.ts`) is the only write gate** for names in the grid. Drag, swap, bulk and paste all go through it.
- **Hard problems block printing:** an open store-day with nobody, the same person at two stores on one date, a name on a closed day, a pharmacist not licensed in the store's state. Time off, covering away and "left as is" are warnings only.
- **Press-and-hold only when there is no undo.** Undoable actions are a normal click with an Undo toast (`announce()`); a `HoldButton` must carry a `// no-undo:` comment (guard in `house-rules.test.ts`). No screen uses one today. Flag any destructive click that has no Undo.
- Rules are not changed unless the owner asks. Please flag rule questions as questions, not as fixes.

## Where to look
Rules files below are in `src/lib/schedule/` unless a path is given.
| Topic | Files |
|---|---|
| Map of the code | `ARCHITECTURE.md` |
| Rules and problems | `src/lib/schedule/rules.ts`, `dashboard.ts`, `district.ts`, `coverage.ts`, `gate.ts`, `place.ts` |
| Fill suggestions (who can cover a hole) | `cover-plan.ts` (planner, up to 3 moves, 150-minute cap, leave-closed card, away-count tiebreak), `suggest.ts`, `hints.ts`; tests `fill-cases.test.ts`, `fill-robust.test.ts` |
| Mileage pay | `mileage.ts` (pay = 2 x (one-way miles - 20) x IRS rate), `drive-table.ts` (measured miles and minutes for all 120 store pairs), `geo.ts` (estimates when a store has no table row) |
| Saved file | `file.ts` (zod schema; v1 files upgrade on open), `file-compat.test.ts` with `fixtures/` |
| Printing | `print-model.ts`, `pdf.ts` |
| Sample data | `demo.ts`, `artifacts/HiSchool_Pharmacy_October_2026_DEMO.hisp.json` (fictional people) |
| UI conventions | `artifacts/COPY_GUIDE.md`, `artifacts/STYLE_GUIDE.md` (partly dated), `src/components/marks.tsx` |

History and intent: `docs/WHATS_NEW.md`, `handoff/HANDOFF_CONTINUE_2026-10-02.md`.

## Run the checks
```
npm install
npm run check      # types + 372 unit tests, includes fuzz (about 15 s)
npm run lint
npm run fill       # fill-suggestion tests, no browser
npm run e2e        # browser suite (needs Playwright's Chromium; npm run build:trial first)
npm run guards     # file size, allowed web hosts, page smoke
npm run pressure -- --level low
```
Details: `e2e/README.md`. CI runs these on every PR; a weekly cloud run does the long version.

## Known open items (do not report these as discoveries)
- Three WebKit-only (Safari engine) findings in the non-blocking CI job: (1) a script error / ResizeObserver message tied to the undo label, in the pages group; (2) a text-contrast warning on the person form; (3) the day panel not staying inside the screen at 1366 px.
- Parked crash: a synthetic 120-store, 500-person month crashes the browser tab at 1366 px desktop width (phone width passes). It appeared with the fill-suggestion work; #45 made the large-month search lighter but did not cure it. An 18-store month is unaffected, and the real district has about 16 stores.
- Untested: real printers, iPhone Safari, real touch. Road miles and minutes are a one-time Google Maps measurement (2026-10-02), not live.
- Never used yet by the real district manager. Real rules beyond licensing (max days in a row, weekend rotation) are unknown.
- Three large functions are candidates for splitting; `jump.ts` and the store have thin tests (known, deferred).

## Questions most wanted
1. **Fill logic and ranking.** Is the cost model sensible (drive time made steeper the longer it is, floats cheaper, mileage dollars counted, long drives last, a plan may leave one other store bare)? Any case where the top plan is clearly wrong, or a better plan is missed? Chains of 3 moves and the 150-minute cap: right limits?
2. **Mileage rule.** Pay for both directions, miles past 20 one way, at an editable rate. Math and edge cases (unknown distances show "mileage unknown", never $0).
3. **Rules engine.** Gaps in coverage, double-booking, closed-day, licence and time-off logic; anything the fuzz and invariant tests would miss.
4. Anything a working pharmacy scheduler would trip on that the tests do not cover.

Suggested output: a ranked list of findings, each with file and line, a short failing scenario, and a confidence note.
