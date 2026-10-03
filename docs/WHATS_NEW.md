# What's new

Newest first. One short block per batch: what changed, where to look, what was checked and what wasn't.

## No more press-and-hold on anything you can undo
- Rule: press-and-hold is only for an action with no undo. All seven holds (Remove on a time-off entry, Remove and "Schedule on N more days" in the day panel, Keep at a store, Leave as is, Leave N as is, Approve N safe) were undoable, so they are now plain clicks with the Undo toast. "Approve N safe" is now one undo step instead of one per request. `HoldButton` stays for a future non-undoable action and must be marked `// no-undo:` (guard test).
- Checked: unit tests, browser groups that used the holds. Not checked: touch, iOS Safari.

## Time off: holidays on the month
- A holiday sits on its day on the Time off month: the name in the corner and "closed N" for the stores it shuts (hover lists them). If a pharmacist is still named at a shut store, the day is brick and clicking it opens that day on the Schedule. Under the month, one line adds "Next holiday". District closures (weather, short-staffed) are not shown here.
- Display only. Checked: unit tests for the holiday days, time off browser group, laptop screenshot. Not checked: touch, iOS Safari.

## Time off: a queue and one month
- The three tabs and the lanes strip are gone. The page is two columns: on the left three filters (To approve, Approved, Declined), on the right one sticky month, the only calendar on the page. To approve opens first when anything waits.
- To approve: one row per request (name, dates as a range, a brick dot if a store would be bare). The selected row opens into its slip. Approved and Declined rows keep Edit, Undo approval / Reopen, and the hold to remove, and still show "Still on ... prints yellow" with Show on schedule.
- The month shows how many are off each day (approved solid, waiting dashed and lighter, brick ring where a store would be bare). Hover names them. Click a day to list only what covers it (click again or the chip to clear). The open slip's days are outlined. One line under it: the busiest day. The day details (who is free to call, Add for this day) open under the month.
- The header picture is three bars (To approve, Approved, Declined) instead of a mini calendar; the header box and size are unchanged.
- When nothing waits, To approve says "Nothing to approve" and the month takes the width. On a phone the month sits above the queue.
- Display only. No rule, status or placement change. Checked: unit, full browser suite (time off, pages, small month, next month updated for the new page), laptop and phone screenshots. Not checked: touch, iOS Safari, printers.

## Time off: requests as slips
- Each request is now a slip with four facts: the reason (and when it was asked), the dates in words, who else is out those days (by name), and what the stores do ("Every store stays covered", or the bare store and days in brick with "no one free" when that's true). The month strip inside each request is gone; the lanes above still show the month.
- Find cover moved onto the bare store (one per store, opens its first bare day); Approve is only Approve and stays on the page.
- Display only: no rule, status or placement change. Checked: unit, time off browser group, laptop screenshot. Not checked: phone, touch, iOS Safari.
## Day panel: someone placed on approved time off
- The panel for a person who is placed on a day they have approved time off now shows three actions: Find cover, Remove, and Reject time off. Change person and Swap with are gone there. Reject time off marks that time-off entry declined (the whole entry; the button names its dates when it spans several days), so she stops counting as off and stays on the schedule. Undo is in the toast. Other states (sick, requested, no time off) keep their buttons. Display and button change only; no rules touched.
- Checked: 388 unit, 552 browser (new group "reject time off"), screenshot at laptop width. Not checked: real touch, iPhone Safari.

## Time off: clearer approval, and Undo approval
- Requests: one line says "These are waiting for a yes or a no." Approve is a plain one-click button and stays on the page; its toast offers Undo approval for about 6 seconds. Find cover appears only when approving would leave a store empty (it approves, then opens that day). Decline asks first. "Approve anyway" is gone. The header count reads "To approve".
- Add drawer: the choices are now "Put it on the schedule" (default) and "Ask me first". Sick is still approved straight away, and the Someone's out button says "Records sick as approved."
- List: approved rows (Sick too) have Undo approval next to Edit. It sets the entry back to requested: it returns to Requests, stops counting as time off, and nobody already placed is moved. Remove is still the hold. No new status.
- Checked: unit tests for Undo approval and Sick in the list, browser group for Approve, Undo approval, Decline confirm, Sick row. Not checked: real touch, iOS Safari.

## Store tag note lists the pharmacists
- Right-clicking a store tag in the header's day strip now also lists who is scheduled there that day, one name per row in day-panel order, or "No one scheduled" for an open store with nobody. Display only. Checked in Chromium (e2e header links, hover rules); WebKit and touch not checked.

## Housekeeping for outside review
- Added README.md and REVIEW_GUIDE.md (what the app is, what it deliberately is not, where to look, how to run the checks, known open items, and the questions most worth reviewing). Refreshed ARCHITECTURE.md and the handoff notes to match main. Docs only: no code or rules changed.
- Since the last entry: hover text on the day strip was reworded (#43), the three-dot marker came off the big header number with a hairline on hover (#44), the time-off timeline and legend were tidied (#40, #41), the hexagon came off the issue header (#39), and QC fixes landed (#45: the security scan allows the one IRS link; the fill search is lighter in very large months).
- Note: an older entry below says "18 stores". The list is now 16 (see "Store list updated").

## Store list updated to the HSP Float Store List
- Real store numbers now come from the Float Store List (for example Cathlamet 1148, Clatskanie 1147, Estacada 1152, Medicine on Time 600). They replace the placeholder numbers 1101-1118 for a new or practice month.
- Scappoose (1165) and West Linn (4900) are removed from the store list, the practice month and the measured drive table (16 stores, 120 pairs). Mt Angel Drug (1177) was never in the app. Every store on the list already had measured distances, so nothing is blank.
- Cave's, Len's and Rogue River are not on that list but stay. They have no number yet and show their letters (CAV, LEN, RR); enter one on Stores > Edit.
- Every store is named by its town. The one plain "Hi-School Pharmacy" (Clatskanie, formerly "Rick's") is now "Clatskanie Hi-School Pharmacy".
- Months you already saved keep the stores and numbers they were saved with. Open one and the old stores (and their placeholder numbers) are still there; nothing is changed or removed behind your back. Distances to a saved store that is no longer on the list fall back to address estimates.

## Fill suggestions: longer reach, a leave-closed choice, honest follow-on holes
- Fill plans now reach up to 2.5 hours (was 2). Long drives (over 90 minutes) still rank last among plans that leave no gap. A plan is at most three moves.
- When no one can reach a store within 2.5 hours (John Day, for example), the card says so and offers "Close <store> today…" with the usual reasons. Leaving a store closed is always your choice; nothing is closed for you.
- A plan may take the only pharmacist from one nearby store to fill a hole. It says so ("Leaves <store> with no pharmacist. It will get its own suggestions, or you can close it."), ranks after plans that leave no gap, and the new hole then gets its own suggestions as usual. Never more than one new hole per plan.
- Cathlamet to Clatskanie legs show a "ferry" tag (60 minutes, wait included).
- `npm run fill -- --level low|medium|high` (no AI tokens) tests all of this: Grok's cases, random shifts checked against the hard rules and the mileage math, repeated accepting of top plans, and a 30/60/120-store month against time limits. The weekly cloud run includes them. A plan that leaves another store bare is allowed: it is labelled, ranked by the normal rules (it carries a small penalty, so a plan that leaves no gap usually comes first), and simply becomes the next issue to fill or close.
- Ranking is unchanged otherwise: drive time (steeper the longer), floats cheaper, mileage dollars counted. Grok's seven test cases are unit tests (`fill-cases.test.ts`). Nothing is placed automatically.

## Adding a store: its distances
- When a store is added (or its address changes) so that it has no measured distances, Setup > Stores shows one collapsed line: "<store> has no measured distances to N stores. Add them". Open it for one row per other store (miles and minutes; blank keeps the estimate; miles without minutes works the minutes out). Saved numbers are "set by you" and take priority. Nothing appears while every store is covered. Closing a store needs nothing: removing it removes its distances and it leaves suggestions. The paste box also accepts an optional minutes column (CAT,CLA,31.4,45).

## Real drive distances between all 18 stores
- The app now carries measured one-way road miles and drive minutes for every pair of the 18 stores (Google Maps, Oct 2, 2026; fastest route, 10 AM weekday, the temporary I-5 Rose Quarter closure left out). They replace the address-based estimates: no "~" on those times, and mileage pay uses the real miles. Order of use: a number you set by hand, then this table, then the estimate (used only if a store's address changes). Cathlamet to Clatskanie includes the Wahkiakum ferry (45 minutes plus 15 to be there before the boat). Some Waldport/Florence routes to the north are the fastest route, not the shortest (up to about 34 miles longer than going through another store); mileage pay follows the table.

## Names in laptop calendars, paste many drive distances
- At laptop width (1024 px and up) a name in a store calendar cell may use two lines before it is cut, so "M. Quenby" no longer ends in "...". Phones keep one line. Display only.
- Drive times between stores has a new "Paste many distances at once" box: one pair per line as store code, store code, one-way miles (CAT,CLA,31.4). Good lines are saved (Undo brings the old values back); bad lines are listed and skipped, never guessed.

## Checks (no visible change to the app)
- Mileage pay: when a pharmacist works away from their home store, every mile past 20 (one way, store to store) is paid, both ways, at the federal (IRS) rate, 72.5 cents for 2026, which you can change under Drive times between stores. Fill and move suggestions count it: three short moves can beat one long drive, and plans show the paid miles or dollars. You can set miles per store pair (otherwise they are estimated from the addresses). Unknown distances show as "mileage unknown", never as zero. Display and ranking only: nothing is placed for you.
- The pressure run gained security and stability tests: a source scan (no eval, no unsafe HTML, safe external links, no network calls), hostile files (prototype pollution, huge or deeply nested files), markup injection in names/notes, and time-zone/language checks. They found one real problem: opening a file with thousands of people was very slow (16,000 people: 4.8 s, now 0.07 s). Also a new undo/redo round-trip test.
- `npm run all` / `npm run deep` run every check side by side with a short summary (details in `test-logs/`); `npm run guards`, `npm run sweep`, `npm run screens` run one piece. A weekly cloud run does the long version. Red day-panel cards, holiday and left-as-is rows, the drive card and the store form's closed-weekday label gained their kind's mark; right click, Shift+F10 or a long press opens a note (hover only draws a small corner marker). Not checked: real touch, iPhone Safari, printers. See `e2e/README.md`.

## Notes open on right click
- Hovering no longer pops anything up. A tiny marker (a small chip with three dots, in the subject's colour) appears on the corner of anything that has more to say. Right click it (or Shift+F10 on the keyboard, or press and hold on a phone) to open the note. One note at a time; Esc, a click elsewhere or scrolling closes it. Text fields and plain text keep the browser's own right-click menu.

## Structure (no visible change)
- Day panel split into four files; problem kind names and order live in one file (`problem-kinds.ts`).

## Build stamp
- File menu, under the save status: "Trial build · Oct 2, 4:41 AM · 0f7262c" (build kind, when it was built, version). Tells a fresh build from an old one.

## Store numbers, popups, workflow
- Stores are named by number everywhere (placeholder numbers 1101–1118 until the real ones are known). Stores page > Edit to change one.
- Day cells on the store calendars have the same popup as the rest of the app: store and date, what is going on, its mark and colour edge, "Open this day".
- Tooling: `npm run check`, run one browser check by name, CI on every PR, `ARCHITECTURE.md` (where things live).

## Audit and small hardening
- `npm run audit` runs the big read-only audit (size and complexity scan, engine and page timings, unit coverage, dependency scan, 300-seed sweep, full deep run) and writes `test-logs/audit-<stamp>/REPORT.md`.
- New guard: no generated folders or files over 1.5 MB are committed.
- Unit tests for the storage fallback; `@types/node` and `vite` patch updates; one export dropped.

- Standard checks added: `npm run coverage` (floor 90% lines / 82% branches on the rules code, part of `npm run all`), a `phone touch` browser group (390 px, touch, 4x slow CPU), a non-blocking WebKit (Safari engine) CI job (`BROWSER=webkit npm run e2e`), and a weekly dependency scan in the deep check.
- `npm run pressure -- --level low|medium|high` pushes the app past normal use (damaged files, odd data, a 120-store month, full or refused storage, reloads mid-edit, squeezed and zoomed screens, a long session, 1,000 random schedules). Each test is its own process; a weekly cloud workflow (`pressure test`) runs each on its own machine.
