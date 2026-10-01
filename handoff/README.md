> SUPERSEDED by `HANDOFF_CONTINUE_2026-10-02.md`. Kept for history; parts are out of date.

# Hi-School Pharmacy month scheduler: handoff for an in-depth review

Snapshot: 2026-10-01 (v2 build). Status when packaged: typecheck clean, 260/260 unit tests pass, full browser suite ("all checks passed"), production build current.

## 30-second picture
A single-user, fully offline web app for ONE person: the district manager of Hi-School Pharmacy (a small Oregon/Washington chain). She schedules **pharmacists only** (no techs/cashiers) across several stores, one month at a time. It is NOT an auto-scheduler and has no AI. The human chooses who covers each hole; the app shows holes, who is free, who would be double-booked, and what each choice would break. Data is a single file (`.hisp.json`, format `hischool-schedule` v2; v1 still loads) plus browser autosave. Ships as one HTML file (`dist-spa/spa.html`) that works from disk.

Users: the district manager (primary, uses phone AND laptop, not technical). Output: a printed/PDF packet each store posts. Real-world stakes: an empty pharmacy shift or an unlicensed/double-booked pharmacist is a real operational problem.

## Run it
- Fastest: open `dist-spa/spa.html` in a browser (Load the sample from the welcome screen, or File > Open `artifacts/HiSchool_Pharmacy_October_2026_DEMO.hisp.json`).
- Dev: `npm install`, then `npm run dev`. Build the single file: `npx vite build -c vite.spa.config.ts`. Serve `dist-spa/` any way (e.g. `python3 -m http.server 3002 -d dist-spa`), open `/spa.html`.
- Tests: `npm run test:schedule` (rules, 260 tests incl. fuzz), `npm run typecheck`, `npm run e2e` (Playwright/Chromium; needs a server on :3002; see `e2e/README.md`). The e2e script defaults to `http://127.0.0.1:3002/spa.html`; do NOT set BASE to a bare host.
- Not testable by the previous builder: Safari/iOS, real printers, the File System Access picker, hosted-viewer downloads.

## Screens and navigation (5 tabs; bottom bar on phone, top on laptop)
The screen is marks, colour and counts. Words appear when a mark is pointed at (hover, keyboard focus, first tap on a phone). See `artifacts/SENTENCE_INVENTORY.md` for the before/after sentence count and `e2e/home-quiet.mjs`, which fails if a sentence appears on the home screen.

| Tab | Route | Component | What is on screen |
|---|---|---|---|
| District | `/` | `district-screen.tsx` > `status-strip.tsx`, `month-grid.tsx`, `district-more.tsx` | One numeral (hard problems left), a count per kind with its own shape, requests waiting, the verbs Fix / Fill / Clear / Mark out; below it the month grid (one cell per store-day, no names) and a legend that is only marks. A collapsed chevron holds the checklist, decisions left as is, and "worth a look". |
| Schedule | `/schedule` | `schedule-screen.tsx` > same strip, `month-board.tsx`, `store-calendar.tsx`, `day-sheet.tsx` | The strip, then per-store calendars (names are shown here because this is where people are placed). Closed days are a mute track; alarms use the same shapes as the grid; hours, address and phone are on hover over the store name. |
| Time off | `/time-off` | `time-off-screen.tsx`, `time-off-requests.tsx`, `time-off-calendar.tsx`, `time-off-add.tsx` | Strip of marks and counts, then Calendar (default) / Requests / List. A request card is name, dates, a month strip, one mark per store it would leave bare (hover for who is free), and the verbs Approve / Anyway / Decline / Show. |
| Print | `/print` | `print-screen.tsx`, `lib/schedule/pdf.ts` | Strip (marks per blocking kind, page count, Fix / Leave or Print / Save), options on the left, page preview on the right, and two folded sections: Just one page, Send someone their schedule. **The printed PDF keeps full names and words: it is the exception.** |
| Setup | `/people` (+ `/stores`, `/holidays`) | `lists-screen.tsx` switcher | People: roster with home store, role icon, licence, a days bar (dark = Saturdays, hover for numbers). Stores: code, number, name, open-day marks, home staff, bench. Holidays: list. Addresses and phones are on hover. |
| (hidden) | `/style` | `style-guide.tsx` | Live style guide |

The marks: alarms (they raise the count) are `AlarmMark` in `marks.tsx`: hole = square, double = circle, name on a closed day = diamond, not licensed = hexagon, all brick with a white icon. Quiet marks (`QuietMark`): time off = amber dot, covering = green ring, left as is = dashed box, closed = mute track.

## Core ideas the reviewer must understand
- **Problem kinds** (each has icon + color + non-color cue): *hole/no coverage* (open store day, nobody; brick, dashed), *double* (same person two places same day; ringed), *leftover* (name on a closed day; hatched), *licence* (not licensed in the store's state; dotted), *time off* (yellow, prints, does not block), *cover* (floating/away from home store; not an error), *usual day off* (soft block, override with confirm).
- **Day panel for an empty shift**: green "Available to cover · N free" ranked suggestions (Free, working-elsewhere, usual day off, on time off) with reasons, drive time, phone link, "Schedule" pill; search for anyone else.
- **Rules engine** `src/lib/schedule/` is pure and tested; `place.ts: placeName` is the only write gate; `dashboard.ts: choicesFor/offerable`, `suggest.ts: rankCandidates`, `glow.ts` (read-only mirror of choicesFor, differential-tested), `bench.ts`, `history.ts`, `impact.ts`, `print-model.ts`. UI must call these, not reimplement.
- **Safety UX**: undo stack (50 full snapshots), "Recent changes" with Undo N, press-and-hold buttons (`ui/hold-button.tsx`) for one-shot irreversible decisions (fill sweep, no ring), print gating (holes/doubles/leftovers block PDF; time off does not).
- **Icon system**: single registry `icons.tsx` (`ICON`, `Mark`, `RoleMark`, `ICON_GUIDE`); home = house, float = life buoy, drive = car, etc. A unit test enforces every icon is in the in-app Icon guide.
- **Stack**: TanStack Start/Router (hash-history SPA, single file), React 19, Tailwind v4, Zustand (`store/schedule-store.ts` doc/undo/autosave, `store/view-store.ts` UI state), Radix Dialog/Dropdown, sonner, jsPDF, zod.

## Design system (analyze all of it)
Tokens in `src/styles.css` (colors, spacing, type scale, radius, motion keyframes `hs-fade/rise/slide-in/pop/select`). Buttons `src/components/ui/button.tsx` (default = ink; secondary = hairline ring; no bright red buttons by owner request), `ui/hold-button.tsx`, dialogs/sheets `ui/dialog.tsx`. Palette: pine/cream/paper, ink selection, brick = problems, yellow = time off, green = available/OK, red reserved for brand. Fonts Source Sans 3 (bundled). Rules adopted: 15px base small text, 44px touch targets, quiet motion, reduced-motion respected, Larger text and High contrast modes.
**Warning:** `artifacts/STYLE_GUIDE.md` is partly OUTDATED (still says brand red is the primary button; that was later removed). Code (`styles.css`, `button.tsx`) and the `/style` page are the truth. `artifacts/COPY_GUIDE.md` (wording standard) is current.

## Folder map
- `dist-spa/spa.html` built app. `src/` source (`components/` UI, `lib/schedule/` rules + tests, `store/`, `routes/`, `styles.css`).
- `e2e/` browser checks (`run.mjs` runs the suite; `*.mjs` standalone flows: hold, placing, history, dial, launch-sweep, launch-robustness).
- `artifacts/` COPY_GUIDE.md, STYLE_GUIDE.md (partly stale), REVIEW_RUN_2026-09-30.md (prior QA log), DEMO data file. `artifacts/history/` OLD planning docs and the stale Claude Code prompt: context only, superseded by this handoff.
- `handoff/` this file, `OPUS_PROMPT.md`, `screens/` fresh screenshots (laptop 1366x900 full page and phone 390x844 of every page, plus day panel and Add time off).
- `harness/` build stubs needed by the vite config; ignore.

## Known gaps / unknowns (do not report these as discoveries; do weigh them)
- Never used by the real district manager yet; no timed task tests. Real rules beyond licensing (max days in a row, weekend rotation, two-pharmacist days) are unknown.
- Phone icon on iPhone once produced a white screen; fixed by replacing tel: navigation with a Call/Copy sheet (`dial-sheet.tsx`), reasoned not reproduced. Unverified on real iOS.
- Small calendar cells for tap-to-place on a phone are unverified for touch comfort.
- Hosted viewers block downloads; Save/PDF only verified in a local browser.
- ~40 exports used in one file only (cleanup candidate).
- Ideas deliberately NOT built: drag-and-drop, true semantic zoom, swim-lane drag-to-create.
