# Hi-School Pharmacy month scheduler: review report

Reviewer: Claude (Sonnet 5.5). Date of snapshot: 2026-10-01. No app source was edited. Throwaway scripts live in the session scratchpad only.

Method: read `handoff/README.md`, `OPUS_PROMPT.md`, `COPY_GUIDE.md`, `src/styles.css`, `ui/button.tsx`, `ui/hold-button.tsx`, the big components; viewed all 18 handoff screenshots; drove the built `dist-spa/spa.html` in Chromium (Playwright) at 390x844 touch and 1366x900, with the demo month and a fresh profile; ran axe-core on all 8 routes in 3 modes (phone, laptop, laptop + Larger text + High contrast); measured tap targets, font sizes, contrast ratios, tab order and reduced-motion behaviour.

Labels: **OBSERVED** = I saw/measured it in the running app or code. **INFERRED** = follows from code or measurement but I did not see the failure happen. **GUESS** = judgment about her behaviour. Confidence in brackets: H / M / L.

---

## A. Verdict

1. The core idea is right and unusually well executed: the app tells her the next problem, names the store and day, ranks who can cover, and fixing a hole is 2 taps from the front door (OBSERVED, H).
2. It is intuitive for the weekly "fix things" loop (District, then day panel, then Schedule) but not yet for the "build the month" and "get it onto my phone/laptop" loops, which are hidden in Tools, File and Setup (OBSERVED, H).
3. The safety layer is heavy and inconsistent: three different mechanisms (press-and-hold, confirm dialog, Undo toast) are used almost at random, and press-and-hold sits on reversible actions that already have a 50-step Undo (OBSERVED, H).
4. Look and feel is calm and consistent in structure, but small text dominates (13px is the majority of text), secondary/ghost buttons barely read as buttons, borders are about 1.4:1, and the style documentation disagrees with the code in at least 8 places (OBSERVED, H).
5. Two real functional risks need attention before she uses it: the delivered `spa.html` is a trial build that skips the welcome screen and opens on invented data, and "Start next month" copies existing errors, creates 26 new holes and leaves stale October time-off requests "waiting" in November (OBSERVED, H).

---

## B. Scorecard

| # | Perspective | Score | One-line reason |
|---|---|---|---|
| 1 | First run | 6 | Real welcome sheet is clear (3 choices), but the delivered file bypasses it and shows invented data with no "sample" marker; after "Set up my stores" she must type 22 people using 3-letter store codes, and nothing points to "Schedule home days". |
| 2 | Monthly routine | 7 | Fix-a-hole 2 taps, sick call 5-6, time off 6, print 3 to 9+; best-in-class core loops, but build-next-month is buried and its result is rough. |
| 3 | Information architecture | 6 | 5 tabs are sensible; Setup, File menu (18 items mixing files, history, display, help, data replacement) and Schedule left rail duplicate or hide too much. |
| 4 | Readability | 7 | Problem wording, tags and shapes are excellent and redundant with colour; density and 13px text, 8-swatch legend, truncated names on phone calendars hurt. |
| 5 | Trust and error safety | 7 | Undo stack, print gating, "Leave as is" with confirm are strong; hold-to-act is misapplied, invisible, and breaks under Reduce Motion; licence block has no way out. |
| 6 | Visual design | 6 | Coherent and restrained, but brand almost absent, low-affordance secondary/ghost buttons, 1.4:1 borders, weights 500/700 not bundled, docs and tokens disagree. |
| 7 | Motion and polish | 7 | Quiet, short, purposeful (90 ms press, 140-200 ms enters); hold fill is lovely but lies under Reduce Motion; toast covers header. |
| 8 | Responsive and touch | 6 | Phone nav and sheets good, all buttons 44px; the district map cells are 8.7x16 px, calendar names truncate to "Ma...", Schedule top has 8 control groups before the first calendar, Mark out is below the fold. |
| 9 | Accessibility | 8 | axe: 0 violations on 8 routes x 3 modes; roles and labels in place, text contrast 5:1+ throughout; non-text contrast, 3:1 focus ring borderline, segmented controls inconsistent. |
| 10 | Missing capabilities | 5 | No way to move the schedule between her phone and laptop except manual files; no weekend/consecutive-day/coverage-minimum rules; no per-pharmacist hours view; nothing for who she already called. |
| 11 | Code health | 6 | Pure rules engine and tests are excellent; four 600-900 line components with 15-18 hooks each, a 400-line `SheetBody`, duplicated helpers, stale style comment and docs. |

---

## C. Top findings

Severity: blocker / high / medium / low. Effort: S (under a day) / M (a few days) / L (a week+). Stability risk: low / med / high.

| ID | Persp. | Finding | Evidence | Basis | Sev | Effort | Risk |
|---|---|---|---|---|---|---|---|
| F1 | 1,10 | Delivered `spa.html` is the trial harness: first visit calls `loadDemo()` and sets the "welcomed" flag, so the real Welcome sheet never shows and she lands on October with invented people ("Marisol Quenby") and "13 to fix". No "sample data" marker on District, header or Print. She could print or save a fake month. | `harness/spa/main.tsx` lines 11-22; fresh-profile run showed District with no Welcome; screenshots `district-*.png` have no marker. With the trial flag preset the real Welcome appears (`welcome.tsx`). | OBSERVED H | high | S | low |
| F2 | 10,2 | Phone and laptop are separate stores. Data lives in each browser's localStorage; the only bridge is a manually saved `.hisp.json`. On iOS there is no File System Access, so Save = download to Files, Open = picker. She will edit on one device and have a stale month on the other. | `file.ts` 247-332 (picker if present, else download); no `navigator.share` anywhere; README "uses phone AND laptop". | OBSERVED (code) H; effect on her GUESS M | high | M | med |
| F3 | 2 | "Start next month" copies October by weekday including its mistakes, drops 46 names (no 5th Thu/Fri), and in my run produced **29 to fix, 26 shifts with no coverage** in November. The confirm dialog is a wall of "no matching weekday" lines that bury the 2 meaningful ones. It is not on the District page; the "Start November" banner exists only on Schedule near month end (`showStartPrompt`), otherwise under Tools. | Run: Schedule, Tools, Start November, Start; dialog text; `month-board.tsx` 164-173; `month-tools.tsx`. | OBSERVED H | high | M | med |
| F4 | 2,5 | Stale October time-off requests ("Bram Okafor Oct 27-28", "Gideon Ashcroft Oct 30") remain "waiting" in the November doc: District chip "2 time-off requests waiting", tab badge 2, a bulk "Approve the 2..." button, and cards reading "Not on any shift those days". Deciding them does nothing visible. | After Start November: Time off page text; District text "2 time-off requests waiting". | OBSERVED H | high | S-M | low |
| F5 | 5 | Press-and-hold is on reversible actions that already have Undo: Remove a name, Leave as is (each problem), Keep one of a double, Decline, Approve anyway, Schedule N more days. The hold cue is `sr-only` ("(press and hold)"), so sighted users learn by failing: a quick tap shows a 1.6 s toast "Press and hold to confirm". Slows the most frequent edits (700 ms each, 900 ms for bulk). Meanwhile bulk "Leave 12 as is" uses a confirm dialog when holes exist and hold when none. | `hold-button.tsx` 65, 118; usages in `day-sheet.tsx` 257/276/513/542, `time-off-requests.tsx` 44/121/131, `print-screen.tsx` 268-274; confirm in `print-screen.tsx` 142-157. | OBSERVED H | high | S | low |
| F6 | 7,9 | With OS "Reduce motion" the hold fill snaps full instantly: global `*{transition-duration:.01ms !important}` overrides the inline transition. Fill reads "done" at pointer-down while the action fires 700 ms later. Measured: at 250 ms into a 700 ms hold, transform = 0.357 normally, 1.0 with reduced motion. | `styles.css` 177-185; `hold-button.tsx` 115; Playwright measurement. | OBSERVED H | medium | S | low |
| F7 | 8 | District map cells are 8.7x16 px on a phone (31 columns in 390 px), yet the caption says "Tap a square to open that day". Un-tappable by finger; also eight legend swatches to decode. | `data-cell` measurement; `district-phone.png`, `map-phone.png`. | OBSERVED H | high | S-M | low |
| F8 | 8 | Phone Schedule: before the first calendar there are, in order, the problem card, "Place a person", breadcrumb, Calendars/Week/Day toggle, store chip row (clipped), Today + Everyone + All stores selects, Tools. First calendar starts at y~545 of 844. Calendar cells (48x60) show names as "Ma...", "Mari..." (truncated), so the grid cannot be read without opening a day. | `schedule-phone.png`, `sc2.png`, `month-board.tsx`. | OBSERVED H | high | M | med |
| F9 | 2,8 | Sick-call dialog: Mark out sits at the bottom of a long sheet (below the fold on 390x844 after picking the person) and the native select has 22 options. Steps: sick button (1), pick (2-3), scroll, Mark out (1), Schedule (1), plus Call = 2 extra taps because the Call/Copy sheet intercepts every `tel:` link. | `sick2.png`, `sick3.png`, `dial-sheet.tsx` 13-26. | OBSERVED H | medium | S | low |
| F10 | 5 | Licence problems cannot be left as is and the panel only offers "Remove the name or choose someone else". If her licence list in the app is wrong or incomplete (very likely on day one: licences are typed by hand), the whole pack is blocked with no path to "Add WA to Fenn's licences". | `day-sheet.tsx` 250; Print page "Fix it on the schedule to print"; Print blocked in run. | OBSERVED (text) H; likelihood GUESS M | high | S | low |
| F11 | 4 | District hero chip row on phone scrolls horizontally and clips (shows "6 shifts with no coverage" and half of "3 p..."), hiding 3 of 5 problem kinds behind an invisible swipe. Laptop wraps them correctly. | `district-phone.png`. | OBSERVED H | medium | S | low |
| F12 | 4 | The "97% of open store-days have no problem" ring sits next to "13 to fix, before this month can print". High-looking success number beside a print blocker; a 97% figure is not actionable and invites reading the month as nearly done. | `district-*.png`. | OBSERVED (screen) H; effect GUESS M | medium | S | low |
| F13 | 4 | "Fix the next one" starts at problem 1 (a name on a closed day) while chips jump to problem "8 of 13"; after Schedule Greta the sheet jumps back to "Problem 1 of 12" (a closed-day name), not the next hole. Header "Problem 8 of 13" vs button "Next problem (13 left)" disagree. She loses her place while clearing holes. | `fix1.png`, `hole1.png`, `hole2.png`. | OBSERVED H | medium | S-M | low |
| F14 | 4,6 | Weight/size hierarchy is thinner than it looks: only Source Sans 400 and 600 are bundled, so `font-medium` (110 uses) renders as 400 and `font-bold` (41) as 600. Text is 13px (`text-xs`, 221 uses) for 276 of ~400 text nodes on District and 992 of ~1040 on phone Schedule. README says "15px base small text" and the style page says "Body 14, Notes 12, Button label 14 semibold". Nunito Sans is also bundled (4 CSS imports) but is only a fallback. | `styles.css` 1-4; text-size measurement per route; `style-guide.tsx` 95-100. | OBSERVED (counts) / INFERRED (weight mapping) H | medium | S | low |
| F15 | 6 | Secondary button = `bg-fill #efebe3` + `ring-ink/15` on page `#f7f4ef`: fill vs page is about 1.1:1, ring about 1.5:1. Ghost buttons (Decline, Approve anyway, Show on schedule) are plain text. On the Time off card 3 of 4 actions look like text links. | `button.tsx` 11-14; `time-off-phone.png`, `time-off-laptop.png`. | OBSERVED H | medium | S | low |
| F16 | 6 | Style sources disagree: `styles.css` header says brand red is the primary button (stale); `/style` page hairline `#E6E1D8` vs token `#d9d3c7`; time off `#F2D56A` vs `--color-warn-bg #f4e2a3`; heading "one filled red per screen" while buttons are ink; "never smaller than 12px" vs 13px token and 10px print preview; `STYLE_GUIDE.md` stale; README says "pine" palette but no pine token exists. | `styles.css` 7-12, 18-39; `style-guide.tsx` 10-20, 95-100; README. | OBSERVED H | low | S | low |
| F17 | 5,4 | Print preview header says "6 holes" (a banned word per COPY_GUIDE) and is printed on the district page. Print intro text lists three blocker types, so when only a licence problem remains it still names the other three. | `pdf.ts` 414; `print-laptop.png`; Print text after leaving 12 as is. | OBSERVED H | low | S | low |
| F18 | 3 | Schedule on laptop is three columns at 1366 px: left rail (problems + "Next shift with no coverage" + candidate card), calendars, and the day panel. The rail's candidate card is cramped (names wrap "Lena / Sorensen", pill wraps to 3 lines) and duplicates the day panel's "Available to cover" and the District problem list. | `day-panel-laptop.png`, `lap-daypanel.png`. | OBSERVED H | medium | M | med |
| F19 | 3 | File menu has 18 items in one list: Open/Save as/Export, Recent changes, Redo, auto-save, Restore, Earlier months, Icon guide, Display (Larger text, High contrast), Replay tour, and three "Replaces this month" actions (Blank month, Practice month, September sample) next to Open. Undo is an icon in the header but Redo is in File. Display and Help are not "File". | File menu text (`file.png`). | OBSERVED H | medium | S-M | low |
| F20 | 1 | After "Set up my stores" she lands on People with the "Add several" paste box open. Format is `Name, STORECODE, float, states`; she must know 3-letter codes (EST, MOL) and type "float". The Schedule empty state says "Add pharmacists... Open days stay empty until you schedule them" but does not point to Tools > "Schedule home days", and the screen shows red "22 no coverage" per store and a "Place a person" button with zero people. | `fr2.png`, `fr4-sched.png`. | OBSERVED H | medium | S-M | low |
| F21 | 8 | Time off Add sheet on phone: choosing 22 names without typing is a long scroll; the Why and "Has this been decided?" sections are below the fold; footer summary is sticky and good. Stat cards wrap 2+1 on phone. | `to1.png`-`to5.png`, `time-off-phone.png`. | OBSERVED M | low | S | low |
| F22 | 4 | `twice` uses the Copy icon (two squares), `usualOff` a moon, `float` a life buoy, `licensed` a badge-check, `elsewhere` arrows. The Icon guide has to exist: at least `twice`, `usualOff` and `float` are not self-explanatory, and Copy is also used for real Copy (Call/Copy sheet). | `icons.tsx` 30-50. | OBSERVED (icons) H; comprehension GUESS M | low | S | low |
| F23 | 6,7 | Toast ("Added: Lena...", "October 2026: all stores...") appears at the top and covers the header title, Save and File buttons; on welcome it persisted over several navigations. | `fr2.png`, `to5.png`, `hole2.png`. | OBSERVED H | low | S | low |
| F24 | 5 | "Print with 6 shifts with no coverage?" is awkward, and the note "You can undo this from the District page" is shown while she is on Print. Undo is available globally in the header, so the note sends her somewhere she does not need to go. | `pr2.png`. | OBSERVED H | low | S | low |
| F25 | 11 | `day-sheet.tsx` (879 lines): `SheetBody` alone is ~400 lines; `district-screen.tsx` 735, `print-screen.tsx` 724, `overview.tsx` 633 (each 15-18 hooks). `phoneOf` defined twice (`day-sheet.tsx` 877, `sick-dialog.tsx`); kind-to-icon map duplicated (`problem-row.tsx` 6, `district-screen.tsx` 284); 7 raw `tel:` anchors rely on a global click interceptor. | `wc -l`, greps. | OBSERVED H | low | M | med |
| F26 | 9 | Segmented controls use three patterns: View toggle (`aria-pressed` buttons), Time off (`role=tab`), Setup switcher (links). Non-text contrast of cell borders and card rings is about 1.4-1.5:1 (WCAG 1.4.11 asks for 3:1 for UI boundaries); High contrast mode only darkens `ring-line` to about 1.9:1. Focus ring is `ring-ink/50`, 2px, about 3.0:1. | `month-board.tsx` 220-243; contrast calc. | OBSERVED (code/maths) M-H | low | S | low |
| F27 | 10 | No rule support beyond licences (max consecutive days, weekend rotation, two-pharmacist days, minimum rest) and no per-pharmacist hours/day-count view beyond "N days worked this month" and fairness. `fairness.ts` exists but is not surfaced as a screen. | README known gaps; `lib/schedule/fairness.ts`; People "Days" column. | OBSERVED H | medium | M-L | med |
| F28 | 2 | Print on a clean month is 3 taps, on a blocked month 8+ (tab, Leave as is, confirm, problem row, fix, back to Print, Print pack, system dialog). Print preview shows one page at a time with a dropdown, 41 pages for 18 stores. The page is 3100 px long on laptop (pack, one page, send schedule). | Walk; `print-laptop.png`. | OBSERVED H | low | M | low |

---

## D. Prioritized to-do list

### Do first (high value, low effort and risk)

| # | Change | Benefit | Verify |
|---|---|---|---|
| D1 | **Ship a real build, not the trial harness (F1).** Make the production entry skip `loadDemo()` and the `window.confirm` stub, so a first visit shows Welcome. If a sample is ever loaded, show a persistent "Sample data" chip in the header and on every printed page footer. | She cannot mistake invented pharmacists for hers; first-run path actually used. | Fresh profile shows Welcome; load practice month shows chip; Print footer of practice month says "Sample". |
| D2 | **Stop using press-and-hold on reversible actions (F5).** Remove, Leave as is (single), Keep one, Decline, Approve anyway, Schedule N more days: act on tap and show the existing Undo toast (it already says what happened). Keep a confirm dialog for bulk "Leave N as is" and "Fill" only. Delete the `sr-only` hold text where it no longer applies. | Faster frequent edits, one consistent safety model: tap = reversible with Undo, dialog = bulk. | e2e `hold.mjs`/`timeoff.mjs` updated; tap Remove and see name gone plus Undo restore. |
| D3 | **Fix hold under Reduce Motion (F6)** (only if some hold stays): exempt `[data-holding] span[aria-hidden]` from the global transition kill, or show a non-animated "Hold... 70%" label. | Hold progress is truthful for people with Reduce Motion on (common on iPhone). | Playwright `reducedMotion: reduce`, transform at 250 ms is about 0.36. |
| D4 | **Clear or filter stale time off when starting next month (F4).** Time-off requests whose dates are outside the month on screen should not count in badges, District chips or "Approve the 2". Show them under "Other months". | No phantom red/yellow badge in the new month. | Start November: Time off badge 0 unless November requests exist. |
| D5 | **Make the District map tappable on phone (F7).** Below ~480 px render per-store rows grouped by week, or make each row a 44 px button that opens that store's calendar; drop "Tap a square" copy on phone. | Removes a promise the UI cannot keep; the map becomes a glance, the list below is the action. | Phone: no element advertised as tappable under 44 px. |
| D6 | **Wrap the hero problem chips on phone (F11)** (`flex-wrap`, 2 columns). | All five problem kinds visible without discovering a swipe. | 390 px screenshot shows all chips. |
| D7 | **Licence "can't leave as is": add a way out (F10).** Show a second button: "Fenn is licensed in WA: add it to their licences", which opens the person's licence editor or toggles it with Undo. | A wrong licence list cannot block a month. | Wind River Oct 13 case resolves in 2 taps. |
| D8 | **Next problem order and wording (F13).** After scheduling, advance to the next problem of the same kind (hole to hole), keep "Problem N of M" and "(M left)" consistent. Make "Fix the next one" prefer no coverage first, then doubles, then closed-day names. | Clearing 6 holes stays in flow, about 12 taps to about 12 with no jumping. | Place Greta, sheet shows next no-coverage day. |
| D9 | **Copy fixes (F17, F24).** Replace "holes" in `pdf.ts` with "no coverage"; change print dialog title to "Print with 6 days that have no pharmacist?"; drop "from the District page" (Undo is global). | Matches COPY_GUIDE. | Grep for `hole` in user-visible strings is empty. |
| D10 | **Align docs and tokens (F16, F14).** Fix the `styles.css` header comment, the `/style` page hexes and sizes, and delete `STYLE_GUIDE.md` or replace it with a pointer to `/style`. Remove the Nunito imports if the fallback is not needed. | One truth; smaller file; fewer false rules for the next builder. | `/style` hexes match `@theme`; build size drops. |

### Do next

| # | Change | Benefit | Verify |
|---|---|---|---|
| N1 | **Phone/laptop handoff (F2).** Add "Send to my other device": `navigator.share` with the `.hisp.json` (iOS/Android), a "Save to Files/Drive" hint, and a visible "last saved to file at ..., this device has changes not in any file" status. Keep it offline. | Removes the biggest real-life data risk of a two-device user. | iPhone share sheet opens with the file; opening on laptop shows same month. |
| N2 | **Next-month wizard (F3).** Move "Start November" to District (a hero button in the last 10 days, and in the monthly checklist). In the dialog, lead with what matters (names dropped because closed, licence, usual day off, carried-over doubles) and collapse the 46 "no 5th Thursday" lines to "46 days at the end have no match". Offer "copy but skip last-month problems" and show the resulting hole count before confirming. | She starts a month with a known number of holes, not 29 surprises. | Dialog on demo shows holes forecast; confirm creates the same count. |
| N3 | **Phone Schedule diet (F8).** Collapse Place a person, filters and Tools into one "Filter and tools" row; default to one store (her home store, remembered) rather than all 18; show first names at 13 px with initials fallback or two-letter initials plus colour bar; make store chips a wrapping 2-row grid or a single select. | First calendar appears above the fold; calendar cells carry readable names. | 390x844: first calendar top under 300 px; names legible. |
| N4 | **Schedule laptop rail (F18).** Drop the "Next shift with no coverage" candidate card (day panel does the job) and make the rail 280 px or collapsible; keep the problem list. | Less duplication; calendars get room. | 1366 px: calendar cells at least 70 px wide. |
| N5 | **Sick call polish (F9).** Make the dialog sticky-footer with Mark out; default "Who" to the person scheduled today at her last-used store; add a "Called, no" and "Called, yes" tracker per candidate (the dialog already keeps "declined" in state); on phones let the Call button open `tel:` directly after the first use ("Don't ask again"). | Sick-call tap count 5-6 to 4 with fewer scrolls and fewer 6 am mistakes. | Timed with a script: under 15 s on touch. |
| N6 | **File menu split (F19).** Group into File (Open, Save a copy, Export, Earlier months, Restore), Edit (Undo, Redo, Recent changes), View (Larger text, High contrast), Help (Icon guide, Replay tour, Shortcuts), and move "Replaces this month" actions to a "Start over" sub-section behind a confirm. | Fewer mis-taps near Save/Open; fewer items per screen. | Menu usability test; 18 items to 4 groups of at most 5. |
| N7 | **Button affordances (F15).** Give ghost actions a visible shape (outline or 1px ring at ink/30) and darken the secondary ring to ink/25; make `size="sm"` actually smaller or delete it (it is the same 44 px as default). | Decline, Approve anyway and Show on schedule read as buttons. | Contrast check of ring vs page at least 3:1 for outline variant. |
| N8 | **First-run flow (F20).** After "Set up my stores", offer a 3-step stepper: add people (paste with a store picker, not codes), "Schedule home days" (one tap to pre-fill from home stores), then District. Hide "Place a person" and the per-store "22 no coverage" red wall until at least one person exists. | The first month is done in about 10 minutes without knowing codes. | Fresh profile: from Welcome to a month with only real holes. |
| N9 | **Time-off phone sheet (F21).** Tap-to-pick person list with a sticky search, move Why and "decided?" above the calendar or into a collapsed "More" row; stat cards become one row of three with smaller text. | Fewer scrolls, 6 taps to about 5. | Walk again with a timer. |
| N10 | **Surface fairness and hours (F27).** Add a People column or a District card "Who has worked the most weekends / days in a row this month" from `fairness.ts`. | Gives her the data to make fair choices without adding rules. | Matches `fairness.ts` tests. |

### Consider

| # | Change | Benefit | Verify |
|---|---|---|---|
| C1 | Drop the 97% ring or replace it with "6 days with no pharmacist" (F12); keep the percentage in the Print summary only. | Removes the misleading success signal. | Cold read: she can say what blocks printing in 5 s. |
| C2 | Split `SheetBody`, `district-screen.tsx`, `print-screen.tsx`, `overview.tsx` into 150-300 line pieces with the rules calls unchanged (F25); dedupe `phoneOf` and the kind-to-icon map. | Safer future edits. | Typecheck plus 260 unit tests plus `e2e` unchanged. |
| C3 | Replace the Copy icon for "listed twice" with `Files`/`Layers` doubled-person glyph and keep Copy only for copy actions (F22). | Fewer guide look-ups. | Icon guide test still passes. |
| C4 | Move toasts to bottom-centre above the tab bar on phone (F23). | Header stays visible. | Toast screenshots. |
| C5 | One segmented-control component for View, Time off tabs and Setup switcher (F26). | Keyboard and ARIA behaviour consistent. | axe plus keyboard walk. |
| C6 | Raise UI border contrast to 3:1 for interactive boundaries (calendar cells, inputs) while keeping card hairlines light (F26). | WCAG 1.4.11. | Contrast tool. |
| C7 | Move "Send someone their schedule" off the Print page (it is a People/Schedule action) and shorten the page (F28). | Print page is only print. | Page height at 1366 px under 2000 px. |
| C8 | Optional dark theme for 6 am use. | GUESS: she may use the phone in bed or in a dark room (L). | Only if she says screens are too bright. |

### Skip (and why)

| # | Idea | Why skip |
|---|---|---|
| S1 | Drag-and-drop, true semantic zoom, swim lanes | Already deliberately deferred; touch precision on phone makes them worse than tap-to-place; day panel flow is 2 taps. |
| S2 | Auto-fill or "optimise" the month | Violates the product rule (human decides). The current Fill dialog (proposal she unticks and confirms) is already at the edge; do not extend it. |
| S3 | A notifications or messaging system for sick calls | Offline-only; the Call/Copy sheet and ICS/text export cover it. |
| S4 | Technician or cashier roles | Out of scope. |
| S5 | Removing the Icon guide | Still needed for `twice`, `usualOff`, `float`; keep and fix icons slowly (C3). |
| S6 | Rebuilding the visual theme to bring back brand-red buttons | Owner decided against; keep ink buttons. If the brand feels absent, bring brand in via the header badge and one accent (e.g. the today marker), not buttons. |
| S7 | More tours or tooltips | Tour already exists and the hierarchy is clear enough; fix the F1 build first. |

---

## E. Questions for the district manager (or watch her do)

1. Open the file cold, say nothing, and ask: "What is wrong with this month, and what would you do first?" (Tests F11, F12, F13: does she find a hole in under a minute, and does the 97% mislead her?)
2. Hand her your phone: "Hollis called in sick this morning." Time it from home screen to "I've texted/called someone". Does she use "Someone called in sick" or the calendar? (Tests F9, the Call sheet and the hold buttons.)
3. "Show me how you move this month between your phone and your laptop today." (Tests F2: Is she emailing files, using a drive, or only using one device?)
4. "Start November." Watch the dialog: does she read it, and what does she do about the 26 new holes? (Tests F3 and F4.)
5. "Remove this name; now decline this request." Do not explain hold. How many tries, and does she call it "annoying" or "safe"? (Tests F5.) Also ask which real rules she keeps in her head that the app does not know (consecutive days, weekends, two-pharmacist days) to size F27.

---

## F. Quick wins for one afternoon

| # | Win | Files | Time |
|---|---|---|---|
| Q1 | "6 holes" becomes "6 days with no coverage" on the printed district page | `src/lib/schedule/pdf.ts` 414 | 10 min |
| Q2 | Wrap hero chips on phone | `src/components/district-screen.tsx` (chip row) | 20 min |
| Q3 | Fix the stale comment in `styles.css` and the two wrong hexes and the size rules on the `/style` page | `src/styles.css` 7-12; `src/components/style-guide.tsx` 10-20, 95-100 | 20 min |
| Q4 | Remove the unused Nunito imports (check nothing sets that family) | `src/styles.css` 3-4; `style-guide.tsx` 95 | 10 min |
| Q5 | Reduce-motion fix for hold fill | `src/styles.css` (add `[data-holding]` exception) or `hold-button.tsx` | 20 min |
| Q6 | Change print dialog title and drop "from the District page" | `src/components/print-screen.tsx` 146-152 | 10 min |
| Q7 | Make ghost buttons visible: add `ring-1 ring-ink/25` to the `ghost` variant when used as an action (or a new `outline` variant) | `src/components/ui/button.tsx` | 30 min |
| Q8 | Tap-to-act instead of hold on "Remove" and per-problem "Leave as is", with the existing Undo toast | `src/components/day-sheet.tsx` 257, 276, 513 | 45 min |
| Q9 | Filter time-off requests to the month on screen in the badge and chips | `time-off` count helpers (`timeoff-view.ts`) | 45 min |
| Q10 | Add a persistent "Sample data" chip when the loaded doc came from `loadDemo` | `src/components/app-shell.tsx` header plus a flag in the store | 45 min |
| Q11 | Move toasts below the header on phone (`offset` option on sonner) | `src/components/ui/sonner` or root | 10 min |
| Q12 | Header subtitle on phone: show "13 to fix" only; drop the truncated "Marisol Q..." | `src/components/app-shell.tsx` | 10 min |

---

## Appendix 1. Flow walk-throughs and tap counts (phone 390x844 touch, demo month unless noted)

Taps count finger touches; typing and system dialogs listed separately. Times are not measured with a real user.

| Flow | Steps (tap by tap) | Taps | Slowest/riskiest step |
|---|---|---|---|
| **First run (real build, fresh profile)** | Welcome sheet shows 3 options and "Not now". Set up my stores (1) -> People page with Add several box open -> type or paste 22 lines using store codes -> Add them (1) -> Schedule: "Add pharmacists to start" banner; Tools > Schedule home days (not signposted) | 2 to 4 plus typing | Typing 22 people with codes; nothing says "next: Schedule home days". With the delivered `spa.html` none of this appears (F1). |
| **Fix a hole** | District: chip "6 shifts with no coverage" (1) opens Schedule with day panel on Rick's Wed Oct 21 ("Problem 8 of 13"); suggestion card "Greta Voss, best fit, ~50 min" -> Schedule (2). Toast with Undo. Sheet then jumps to "Problem 1 of 12". | 2 (+2 if she calls first: phone icon, then Call) | Re-orienting after the jump; the Call/Copy sheet adds a tap. 6 holes: about 12 taps via day panel; "Fill 6 shifts..." dialog: tap Fill (1), review, "Schedule 4 people" (1), 2 stay open. |
| **Sick call (6 am)** | District: "Someone called in sick" (1) -> select person (2, native picker; 3 on iOS wheel) -> date defaults to today if the open month is the current month -> scroll -> Mark out (1) -> candidate list "Best fit" -> Schedule (1) | 5 to 6 (+2 per call) | Mark out below the fold; date defaults to day 1 if the open month is not this month (INFERRED from `sick-dialog.tsx` startDay, H). |
| **Time-off request** | Time off tab (1) -> Add time off (2) -> pick person (3, search or scroll) -> first day (4) -> last day (5) -> Add time off (6). Dialog shows "Every store stays covered" live. Existing requests: "Approve and find cover" (1), "Approve anyway" (hold), "Decline" (hold) | 6 add; 1 approve | Choosing from 22 names; Why/decided fields are below the fold. |
| **Print (blocked month)** | Print tab (1) -> "Leave 12 as is and continue" (2) -> confirm dialog (3) -> licence row (4) -> day panel: only "Remove (hold)" / "Change person" (5-6) -> Print tab (7) -> Print pack (8) -> system dialog (9) | 8 to 9 | 13 problems; licence dead-end; the hold on Remove. |
| **Print (clean month)** | Print tab (1) -> Print pack or Save PDF (2) -> system dialog (3) | 3 | iOS PDF handling unverified (known gap). |
| **Build next month** | Schedule -> Tools (1) -> Start November... (2) -> Start November (3) -> lands on District "29 to fix", 26 no coverage, 2 stale requests | 3 | Result quality (F3, F4), not the tap count. |

## Appendix 2. Measurements

| Item | Result |
|---|---|
| axe-core | 0 violations on `/`, `/schedule`, `/time-off`, `/print`, `/people`, `/stores`, `/holidays`, `/style` at phone, laptop and laptop with Larger text + High contrast |
| Horizontal overflow | None at 390 px on all routes, also with Larger text + High contrast |
| Tap targets under 44 px (phone) | None for buttons/links/selects; exceptions: print checkboxes 20x20 (inputs), skip link 1x1 (hidden); **district map cells 8.7x16 (spans)** |
| Calendar cell on phone | 48x60 px, names truncated to about 3-4 characters |
| Font sizes on phone District | 13px: 276 nodes, 15px: 79, 16: 10, 14: 12, 18: 5, 22: 2, 30: 3 |
| Font sizes on phone Schedule | 13px: 992, 15: 30, 16: 22 |
| Print preview text | 10px (letter sheet preview) |
| Tailwind sizes in components | `text-sm` 249, `text-xs` 221, `text-base` 30, `text-2xl` 10 |
| Weights in components | `font-medium` 110, `font-semibold` 179, `font-bold` 41; bundled 400 and 600 only |
| Radii | `rounded-lg` 54, `rounded-full` 50, `rounded-xl` 42, `rounded-md` 32, `rounded-sm` 22; tokens md, lg, xl, 2xl, 3xl all 10 px (aliases) |
| Button heights | default and `sm` both 44 px; `icon` 44x44 |
| Press feedback | 90 ms scale(0.98) global CSS plus `active:scale-[0.98]` in the Button class (duplicated) |
| Enter animations | `hs-fade` 140 ms, `hs-rise` 180 ms, `hs-slide-in` 200 ms, `hs-select` 280 ms, `hs-pop` 360 ms; hold fill linear 700/900 ms |
| Load | `spa.html` is 2.15 MB, ready about 0.5 s locally |
| Contrast (text) | muted on paper 6.4, on fill 5.9, on closed-day 4.9; brick on brick-bg 5.6; yellow text 5.6; green on green-bg 4.9; white on brick 7.6; brand red on white 5.9 |
| Contrast (non-text) | hairline on paper 1.36, on white 1.49; secondary fill vs paper about 1.1; focus ring about 3.0 |
| Keyboard order (laptop) | Logo, "Show the first" month button, 5 tabs, Search, Save, File, then problem chips: sensible. Skip link present on Schedule |
| Reduced motion | Global kill works for enters; breaks hold fill (F6) |

## Appendix 3. Things that are good (keep them)

- Problem wording and tags (NO COVERAGE, TWICE, CLOSED, LICENSE) with icon, colour and shape; consistent with COPY_GUIDE except "holes" in print.
- Ranked "Available to cover" with reason, drive time, home store, "only one there" cautions; "Not shown: 4 can't be offered for OR" is honest and useful.
- Impact preview in Add time off and request cards ("Would leave 2 shifts with no coverage: could cover ...").
- Undo toast naming the exact change; 50-step stack; Recent changes.
- Print gating with a clear explanation and one-click "Leave as is" with an honest confirm.
- Tests: pure rules engine, 260 unit tests, e2e; axe clean.
- Phone nav: bottom tabs with safe-area padding, bottom sheets, 44 px targets everywhere.

## Appendix 4. Not verified

Real iPhone/Safari (Call sheet, PDF, file picker), real printers, hosted-viewer downloads, screen readers, touch comfort on a physical device, timed task tests with the actual user, and any rule she keeps in her head beyond licensing.
