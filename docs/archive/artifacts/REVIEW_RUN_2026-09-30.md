# Review run — 2026-09-30

Scope: the ten workstreams in the review plan. Method: node tests, fuzzers (/tmp/rev), Playwright flows at 390 and 1366 px, axe-core, PDF render + text-position checks (pymupdf), synthetic stress data (80 stores / 120 people; 6-row month; very long names).

## Findings

| # | Sev | Area | Finding | Status |
|---|-----|------|---------|--------|
| 1 | Medium | Data (B) | Accepted problems were lost when a store code or person name was edited (accept key embeds the code/name), so a problem the manager had already accepted came back as "open" and blocked print. | Fixed (`rekeyAccepted` in identity.ts) + regression test |
| 2 | Medium | Perf (G) | Ranking candidates cost ~230 ms per call at 80 stores / 120 people (recomputed loads per candidate). | Fixed: cached single pass, ~11 ms. Regression test added |
| 3 | Medium | Print (D) | Poster title ran into month label and logo with long store names/numbers. | Fixed: title shrinks then ends in "…" |
| 4 | Medium | Print (D) | Long pharmacist names broke mid-word over 4 lines; second-pharmacist line overflowed cell. | Fixed: max 2 lines, one shared type size per cell (min 7 pt), ellipsis as last resort. A single very long surname still hyphenates mid-word at 7 pt; it stays inside the cell. |
| 5 | Low | Print (D) | Closure reason cut to two lines; day note clipped without marker. | Fixed: up to 3 lines when the cell is tall enough, shrinks to 6.5 pt, then "…"; notes end in "…" |
| 6 | Medium | Print (D) | District sheet footer ("Holes: …") ran past the right page edge when there were many holes (seen at letter/tabloid/punch). | Fixed: wrapped to 3 lines then "…"; accepted/planned list capped at 4 lines with "…". No off-page text in any of 7 layouts. |
| 7 | Low | Code (I) | ~40 exported names are referenced in only one file (dead exports or over-exposed helpers). | Not changed (no behavior risk); cleanup candidate |
| 8 | Info | A11y (F) | axe reports one contrast item on /print: the faint DRAFT watermark preview. Decorative, `pointer-events-none`. | Left as is |
| 9 | Info | Tooling | Some older /home/user/tools scripts target the pre-District landing page and need viewport args; not app bugs. | n/a |

Clean (no defects found): calendar/weekday math across month lengths incl. Feb 2028, rules engine consistency vs. fuzz, undo invariants, license never acceptable, CSV/ICS escaping, prototype-key and oversized-file parsing, pattern/holiday/closure handling.

## Could not verify
- Real printer output and paper punch alignment (only rendered PDFs checked).
- Real schedules and rules: your actual state-license map, real drive times (distances are estimated from addresses), real staffing constraints (max consecutive days, weekend rotation).
- Hosted-viewer behavior for downloads/print (blocked there; tested in a local browser).
- Screen-reader speech, and real-device touch use.
- Timed task walkthroughs with the actual district manager.

## Questions that need her data
1. Are there real rules beyond licensing (max days in a row, weekend fairness, no-single-coverage stores)?
2. Which stores need two pharmacists on which days?
3. Are store addresses complete enough for drive-time estimates?

## Addendum: Time off page redesign
Summary strip (waiting / off / stores left with nobody / busiest day), tabs (Requests, Calendar, List), one "Add time off" drawer (multi-person, range pick, live impact preview, duplicate check, edit), request cards with a month strip showing overlap and other requests, timeline with coverage row, weekends, today, pending requests and arrow-key moves, month grid, phone agenda, day detail with "find cover" and who-can-be-called, list grouped by person or date with filters, undo on every change. New logic in `timeoff-view.ts` (tested); store: `addTimeOffMany`, `updateTimeOff`. axe: no violations at 1366, 390 and 200% zoom after fixing heading order.

## Addendum: page-by-page UI pass (District, Schedule, Print, People, Stores, Holidays)
- Selection is ink everywhere (nav, chips, switches, checkboxes); red is only the one action per screen.
- One shared `ProblemRow` used by Schedule and Print.
- Print: pack summary + buttons + reason + settings first; page choice folded under "Choose pages" with presets; preview has Prev/Next.
- People: filters (role, home store), sort, no-home-store flag and filter, "Add several" button.
- Schedule: on phones stores with nothing to fix start folded; repeated names shown quieter; time-off sidebar no longer repeats "Not on any shift".
- District: coverage grid moved above the store cards; "only pharmacies with problems" toggle; clearer ring caption; shorter requests card.
- Holidays: list first, U.S. holiday picker behind a button, month strip with counts, "N names still scheduled that day" impact, Undo on remove.
- Stores: weekday glyph + home-staff count; icon Edit/Remove.

## Addendum: second review round
Week view tidy (fixed column widths), faded chip row, compact view switch, real "Accept this" button; one shared day picker (Time off + sick call); "what's missing" lines on disabled buttons; Undo toasts on holiday/person/store changes; phone overview starts folded; saved-state pill beside Save; October checklist on District; "What do these mean?" glossary; hand-set drive times (Stores page) with "~" marking estimates; content-visibility on store calendars (interaction 130-210 ms headless); `e2e/` browser checks in the repo (`npm run e2e`); dead exports and unused imports removed, `noUnusedLocals` on; unit tests for PDF text fitting and drive-time overrides.

## Addendum: license-safe suggestions
Suggestions, the picker list, the fill plan, sick-call cover and time-off cover never offer someone who lacks the store's state, or has no licenses on file and is from another state (`licenceForState`, `offerable`). They're named in a "Not shown" note with the reason. Typing a name still works (hard rule unchanged; "no license on file" can be placed on purpose). Spare-pharmacist counts use the same rule. Overview warns about stores whose address has no state.

## Addendum: polish pass
Selection feedback (pop + ring pulse + light touch tick, off under reduced motion), press dip on every control, page and tab fade, lifted cards on hover, 13px minimum text, People/Stores pages wider, checklist in two columns, "Add several" card only when opened. Browser check added for the selection response.

## Addendum: polish pass 2
Secondary buttons and inactive chips use a soft fill (`--color-fill`) instead of an outline; two page widths (6xl content pages, full-width dashboards); saved-state pill only on very wide screens; Schedule sidebar quick-action row; File > Replay the quick tour.

## Addendum: UI review ranks 1 and 2
Seven browser `confirm()` pop-ups replaced by one in-app confirmation dialog (`confirmAction`: what will happen, what is lost, Cancel focused first, dark-red button for destructive choices, Undo toast after removals). Phone: District hero chips scroll sideways so "Fix the next one" is on the first screen; store cards show the week glyph and home-staff count; bottom bar is five entries with a More sheet for Holidays, People and Stores. Browser checks added for the dialog and the bottom bar.

## Addendum: UI review ranks 3-6 (accessibility-specific items skipped by request)
Undo button names what it will undo + "Changes this visit" list (File menu); Fill open shifts moved to the Schedule quick-action row; Search hint in the header on wide screens; checklist opens once per month then folds to one line; float/cover help in the person form and corrected license note; "What do these mean?" in the day panel; tabular figures everywhere; one EmptyState component; Approve buttons get a check icon; one-time "Save a copy to this computer?" prompt after 10 changes or 30 minutes; phone bottom sheets can be pulled down to close.

## Addendum: language pass
All ~1,070 user-facing strings read and rewritten to `artifacts/COPY_GUIDE.md`: plain words, verb+object buttons, one name per idea ("store", "schedule", "Leave as is", "Remove", "Choose", "twice"), problem sentences that lead with what is wrong ("Petra is listed twice at Len’s on Tue Oct 6"). Fixed a wrong day count in the "week of" hint. Tests and browser checks updated to the new wording.

## Coverage wording pass
Replaced "open/nobody/off" with explicit "no coverage", "working at X (only pharmacist there)", "on time off"; added `elsewhereSolo` to choices and a ranking penalty + caution for moving a solo pharmacist. Tests 240 pass; e2e all pass.

## District-manager walkthrough fixes
One-tap best fit in the day panel (empty slot or approved time off); "approved days off still have a name" line with find-cover; print accept-all shows a breakdown and confirms when no-coverage shifts are included; Fill dialog unticks 90+ min drives, labels "drive", lists who's on time off / movable when no one is free; second-look wording.

## Clean copy print switch
Print page: "Clean copy: names and days only" switch (this print only, not saved). cleanModel() in print-model.ts strips from-notes, day notes, closure reasons, Revised, PTO/DBL/OFF/cover marks, red hole cells, hole list and decisions list on posters, calendars and the district page. The problem check still applies.

## Overrides pass
Approve-all-safe time off (safeToApprove, sequential); relief pharmacist (one-day Person via startsOn/endsOn) in the day picker; per-row "someone else" in Fill; Person.noSuggest ("Don't suggest this person", saved in file); "X is licensed in ST" quick record on the not-offered list.

## Self-directed follow-up review
Checked new features for regressions: file round trip (noSuggest, relief dates) OK; next month no longer copies relief/ended people (reason "not-employed", shown in the Start dialog); phone "time off" cell tag wraps instead of clipping; Fill dialog copy mentions picking someone else.

## Phone Fill button + PDF proof
Fill button now shows under the folded "N to fix" header on phones. New unit test builds the real PDF pack (normal vs clean) and checks the text: clean has no from/DBL/PTO/holes/decisions text and keeps names.

## Pre-launch test run
Static: tsc clean, npm audit 0 vulnerabilities, no fetch/XHR/eval/innerHTML in src, zero external requests when every page is loaded with the network blocked.
Fuzz (src/lib/schedule/fuzz.test.ts): 1,500 random edits ×2 months never place an unlicensed person, suggestions never unlicensed, Fill never double-uses anyone, save/load lossless, next month from every month incl. Dec and leap Feb, real PDFs for every store/person × clean/normal × letter/tabloid × 1-up/2-up, hostile names and garbage files.
Browser (e2e/launch-sweep.mjs, launch-robustness.mjs): 7 routes × 7 widths (320–1920) no overflow/errors; axe serious/critical 0 on all routes at 2 widths; 80-stop keyboard walk; dialog focus returns to opener; load 264 ms; survives garbage in every localStorage key; 5 clock dates; reload keeps changes.
Fixed: dialogs opened without a trigger lost focus on close; fields could exceed file-schema limits and make a saved file unreadable (maxLength + name check); DRAFT watermark contrast (now decorative pseudo-content); print falls back to opening the PDF when the hidden-frame print fails.
Not testable here: Safari/iOS (only Chromium available), a physical printer, the File System Access picker.

## Usual days off
"Usually can't work" is now "Usual days off" (People page). New choice state "dayoff": excluded from Best fit, Fill and suggestions while anyone else is free; listed last as "usual day off, ask first" (chips, sick dialog, Fill no-one-free note); placing by hand asks once (components/usual-off.ts); typical-week, home-days, copy-day, fill-row and next-month copy skip those days and report them. Not an issue, never blocks printing, prints no mark. Range assign (explicit selection) is not skipped.

## Simple graphics
Coverage-by-day strip (components/coverage-strip.tsx, lib/schedule/day-coverage.ts) replaces the "Days short" list; workload bars replace "N days · M Sat / no time off" text; fixed-so-far progress bar under the "N to fix" header; Fill dialog covered/uncovered segments replace its long description.

## Two-store calendars on the "twice" sheet
components/double-calendars.tsx: when the day panel is for a pharmacist booked at two stores, the bottom shows both stores' month calendars (their days outlined, gaps red, clash day boxed, tap a day to open it).

## Why cover is needed
lib/schedule/why-out.ts + chips in the day panel slot card: "Called in sick", "Time off · Dentist", "Asked for time off, not decided yet", "Not with the company that day". On an empty shift the chip leads with the home-store pharmacist who is out. Button reads "X is out? Mark out, find cover…" when no reason is on file. Removed an empty red box that showed only the glossary link.

## Add time off redesign
Three numbered steps (Who is off / When / Why). Single-person pick by default ("Add another" for groups); calendar defaults to "In a row" (tap first day, then last; "Separate days" switch; Shift-click gone); others-off shown as a count, red dot where a store would have no coverage (riskDates); reason buttons (Vacation, Sick, Appointment, Family, Other) with optional details, saved as "Reason · details"; status "Already approved" / "Waiting for my decision" (Sick auto-approved); sticky summary sentence with consequence; "Add and find cover" when there would be gaps. Sick-call dialog shares the new day picker. Not done: merging the sick-call dialog into this flow.

## Colour: no bright red buttons
Primary buttons are now ink (dark) instead of brand red; danger buttons are a soft red tint with a red outline; "ok" badge is ink; focus ring is ink. Brand red remains only in the logo and today's date marker. Style guide text updated.

## Aesthetic pass
Button hierarchy (main action dark, others quiet; Time off "Approve…", Fill, Save when unsaved); secondary buttons get a hairline ring; quick-action buttons left-aligned; type scale trimmed (no 10/11/12 px outside the print preview, extra-bold gone, body text-sm 14→15 px); bare `rounded` (4 px) → 6 px for tags; phone District grid header shows only "M" per week. Measured: sizes 13/15/16/18/20/22/24/30/36, weights 400/500/600/700, radii 2 (chart marks)/6/10/pill.

## Style pass 2
Add-time-off drawer footer defect fixed; spacing half-steps (6/10/14 px) moved onto the 4/8/12/16 grid; one page-frame padding (px-4 sm:px-6) and one section gap (24 px) on every page; "Back to schedule" removed (nav covers it); section headings sentence-case 15 px (uppercase labels gone except tags); day-panel text aligned to two left edges (underlined inline actions); problem tags differ by kind (solid / outlined / neutral); warn yellow softened (#f4e2a3), card line darkened (#d9d3c7); table headers stronger, trash icons muted until hover, tighter action rows; Stores open-day chips soft green with closed hatched; Holidays "this month" is an underline not a selection ring; People filters stack properly on phone; toolbar selects use the quiet filled look; phone header Save/File compact.

## Debug pass
Found and fixed: People table at 768 px with Larger text overflowed the page by 30 px (sr-only header cell not positioned); text fields and selects were 15 px so iPhone Safari zoomed the page on focus (now 16 px on phones); duplicate viewport meta; tap highlight / double-tap zoom on controls. Scripted checks run: click-through of every button on 7 pages x 2 widths, add/edit/sick/print/people flows, display modes (Larger text, High contrast, both) x 5 widths x 7 pages, 14 dialogs x 4 settings. All pass.

## Press and hold
components/ui/hold-button.tsx: one-shot decisions with no confirmation question after them now need a press-and-hold (0.7 s; 0.9 s for bulk). A fill sweeps across the button while held; letting go early cancels and shows "Press and hold to confirm". Keyboard: hold Space/Enter. Assistive technology that activates the button directly acts at once. Applied to: Leave as is (day panel), Keep at X (twice), Remove (name), Schedule X on N more days, Approve anyway, Decline, Approve the N that leave every store covered, Remove time off entry, Leave N as is on Print (when no shift lacks coverage; that case keeps its confirm dialog). e2e/hold.mjs covers it.

## First-principles simplification
Removed: District "Today" stat tiles (kept only as an alert when a store has no coverage today or someone is out), "This week" panel (the grid shows it), the schematic map, the full "Stores" list (now "Stores to fix", problems only), "N covered" words in day tiles; page subtitles on Time off/Stores/Holidays/People; Time off summary tiles that don't need action; "Since you last printed" card until something is printed; the Enter/? hint line and the "Time off doesn't block printing" line. Collapsed behind "More about this month": checklist, away/left-as-is/worth-a-look/trend/days worked (District); time off list, requests, away, licences, today, days worked (Schedule side panel). Day board: "All stores are closed." and no cover list unless an open store has nobody. Calendar legend is a collapsed "Key".

## Store cards say what and when
"Stores to fix" cards: bottom line names the first problem and its day ("No coverage · Wed Oct 21", "Gideon at two stores · Fri Oct 9 · +1 more") instead of "1 day to fix"; the redundant "First problem: day N" line is gone.

## Day panel redesign (who belongs to what)
Empty shift: brick "No coverage" notice (icon, plain sentence, why-chips, Close / Leave as is side by side) then a green-headed "Available to cover · N free" card whose rows each have their own Schedule button (best fit marked green and dark button), then a search and "Everyone else". The black "Choose person" button is gone for empty shifts. Someone on time off: amber notice, their card, then a "Replace X" cover card. Double booking: "Which store keeps X?" label. Options (second pharmacist, close store, poster note) sit below a divider. The same row design is used in the Schedule side panel.

## Icons, guide, and print-status additions
components/icons.tsx is the single icon list (house = home store, life buoy = float pharmacist, car = drive, phone, note, no coverage, twice, closed, licence, time off, sick, vacation, appointment, family, moon = usual day off, arrows = working elsewhere, relief, pencil-file = changed since printed, printer = printed, star = best fit, approved/waiting, tick/warning on Print lists). components/icon-guide.tsx lists them all (File > Icon guide, search "icon", "See every icon" links in the calendar Key and the problem glossary); a unit test fails if an icon is missing from the guide. Built: call buttons (day panel, cover rows, pick list), note icon on calendar cells, tick/warning per store and person on Print, header "Printed Oct 1 / N changed since printed", changed-since-printed pencil on store headers and Print lists. Icons replace text in: problem tags, store flags, district chips, role/home labels, People role/licence/usual-day-off dots, reason buttons, status pills, pick-list tags.

## 2030-inspired, stability-first changes
Read-only or existing-path only: breadcrumb (District > store > day) on Schedule; Bench column on Stores (lib/schedule/bench.ts, unit-tested); Recent changes dialog lists each undo step in words (lib/schedule/history.ts, diff-based, no store changes) and "Undo N" uses the existing undo N times; People/Stores/Holidays moved under one Setup tab with a switcher (old addresses still work); "Place a person" tap-to-assign with a green-day glow (lib/schedule/glow.ts) that goes through the normal setCell/okToPlace path and only fills empty pharmacist shifts. Safety nets: differential test proves glow == choicesFor on >1,000 empty shifts incl. doubles, time off and usual days off; sweeps caught a sideways-scroll regression from the new Bench cell, fixed. Drag-and-drop deliberately not built. Standalone checks: e2e/placing.mjs, e2e/history.mjs, e2e/hold.mjs.

## Fix: phone icon gave a white screen
Cause (likely, found by reasoning; Chromium can't reproduce an in-app browser): a plain tel: link navigates the page itself, and inside a hosted/sandboxed page on iPhone that navigation blanks the frame. Fix: components/dial-sheet.tsx intercepts every tel: link (one listener, so People, Stores, sick dialog, cover rows and the day panel are all covered) and shows "Call NAME / number" with a Call button that opens in its own window plus Copy number. The schedule never navigates. e2e/dial.mjs checks it.

## Fix: quick wins from the second review (2026-10-01)
Hold fill now fills over its hold time under Reduce Motion; printed district page says "N days with no coverage"; style docs/guide corrected (hairline hex, text sizes, no red buttons); unused Nunito font removed; print confirm note no longer mentions the District page; header shows "Sample data" chip when a sample/demo file is open; phone header subtitle shows only "N to fix"; District hero chips wrap instead of scrolling sideways.

## Declutter pass (2026-10-01)
District: problem pills became tiles (colored icon badge, count, label; one column on phone); tour card removed; heat strip hidden on phone (cells too small to tap). Schedule on phone: breadcrumb and "Stores shown" filter hidden (store chips and bottom tabs cover them), "Place a person" moved into the control row, person picker on its own row.

## Visual polish pass (2026-10-01)
Buttons: primary ink with top highlight and press-in; secondary white with edge border and small shadow; ghost tints on hover/press. New --color-edge token for borders of pressable things (stronger in High contrast). Cards: two-layer soft shadow, radius 14. Fields and selects: edge border plus inset shadow. Store chips white when idle. Header: blur and soft shadow. Page: faint paper grain. Fonts: added Source Sans 3 500 and 700. Status colors, icons and cues unchanged.

## Graphics pass (2026-10-01)
Ring removed; "When the problems fall" day chart added; Good-to-know tiles grouped and now open the hidden panels. Heat grid: fine days are a soft tint, problem days glow; hover crosshair; problem count at row end. Store cards: 31-day ribbon.

## Uniformity and page heroes (2026-10-01)
Every page now opens with the same dark header (PageHero) carrying one chart unique to it: Schedule coverage by day, Time off who is off by day, Print the four gates and pack contents, People licences by state, Stores open by weekday, Holidays stores open each day. Shared tokens: radius 14 for cards/heroes, 10 for controls, --color-edge for pressable borders, white cards with a hairline ring get the same soft shadow as `surface`, Button variants light/lightGhost for dark headers. Days worked is a stacked bar (Saturdays dark, other days light) with hover text, on District and in the People table.

## Hero graphics round two (2026-10-01)
Schedule header: next-gap tear-off calendar (store badge, days away), month dial (31 days around a ring, thicker = more problems, tick = today), month pulse line along the bottom. Time off header: three pictures behind a small switch: If approved (impact web: requester, stores left bare, who could cover with drive time), Who is away (lanes with bars and a brick band on days a store is left bare), Next to leave (departures board with a lamp). Every element has a hover/focus note (fixed-position, so the dark header never clips it) and day segments are keyboard reachable. Dial hidden on phones.

## Strip-down (2026-10-01)
Direction from the owner: marks, colour and counts on screen; words only on hover/focus/first tap. Home screen is now a status strip (one numeral, a count per problem kind each with its own shape, requests waiting, verbs Fix / Fill / Clear / Mark out) and the month grid (one cell per store-day, no names, alarm shapes, quiet marks, mute closed track, today only on the day header, popover with who / other store / who is free / what would break). Dark heroes, the next-gap page, dial, pulse, impact web, lanes, board, tiles, the "Also good to know" drawer, the Overview queue and the glossary were removed. Rules unchanged (260 tests). Not changed: a licence mismatch still blocks printing as before (the brief lists only hole, double and closed-day name); the printed PDF keeps full names and words. Sentence counts before/after: artifacts/SENTENCE_INVENTORY.md. New checks: e2e/home-quiet.mjs (no sentence on the home screen), e2e/hover-all.mjs.

Judgment pass after the strip-down: kept two graphics because they carry information the grid does not. The next-gap tear-off calendar page (small, wordless, in the status strip; hover names the store and how far away) and the Time off "who is away" lanes (shown on the Requests and List tabs; the Calendar tab has its own timeline). Dial, pulse line, impact web, board and page-header cards stay removed.

## Debug pass (2026-10-01)
Swept 8 routes x 5 widths for script errors, sideways scroll and blank pages (clean), then drove the new UI: touch two-tap on the grid, hover note hiding on leave/navigation/scroll, keyboard arrows/Home/End/Enter, Clear/Fill/Mark out dialogs, lanes on the right tabs. Found and fixed: a hover note on request cards had "Oct" hard-coded (wrong in any other month); "1 days" on the People phone card; the Sample chip crowded the month title on phones; the strip's "Two places" count (people) did not match the circles on the grid (store-days), so its hover now says how many marks the grid shows. New check: e2e/touch-keyboard.mjs.

## Dark headers back (2026-10-01)
Status strip and every page's strip are the dark hexagon-textured header again (night colour, top-right glow, frosted count tiles, pale-brick alarm shapes that glow, white buttons). Still no sentences: numerals, marks and one picture. District/Schedule: the count, next-gap calendar page, a tile per kind, and the month as a ring. Time off: dot calendar of people off (brick ring where a store is left bare). People: licence rings per state. Stores: stores open by weekday. Holidays: dot calendar of closures. Print: paper stack with the page count. All have hover notes. Phone: ring shrinks to the top right of the header so the grid stays on the first screen.

## Grok review follow-up (2026-10-01)
Applied from the outside review: hover notes have a tail pointing at their cell; header pictures can be read by tapping on a phone (dial and dot calendars: first tap shows the note, second acts; other pictures: tap shows it for a few seconds); dot calendars show every day number in order; grid alarm marks are larger on a quiet cell so square (no coverage), circle (two places), diamond and hexagon read apart; the District grid fades and shows an arrow when more days are off to the right on a phone; Schedule uses a one-row status strip (no ring or calendar page); Print shows a disabled Print button with the page count and "Leave N as is", the paper stack says "pages", and the preview shrinks to fit so a phone shows the whole poster; request chips say "none free" and the button reads "Approve anyway"; People and Stores counts carry a word (pharmacists, licensed, stores); weekday bars show their counts; Remove is the solid button on a closed-day name; the File menu scrolls on short screens. Not changed: the blank cards in full-page screenshots (an artifact of deferred painting, not seen on screen), the Add time off phone sheet (it scrolls; the still was one viewport), and free-pharmacist lists for a closed-day name (there is nothing to cover).
