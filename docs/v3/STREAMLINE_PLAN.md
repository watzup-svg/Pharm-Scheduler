# Streamlining the v3 screens (plan, nothing built yet)

## What the old build did that made it feel calmer
Looked at the old District, Schedule, People, Stores and Print pages again.
1. **Five destinations, not eight**: District, Schedule, Time off, Print, Setup. Everything rare (open, save as, text size, contrast, about) hides in one File menu.
2. **One header carries the state.** The numbers live in one band; nothing repeats them elsewhere.
3. **One thing in the middle.** The District page is a single grid with almost no chrome around it. No permanent side panels.
4. **Pictures in the grid, words in the detail.** Cells show chips and initials; sentences appear only after you pick something.
5. **Progressive disclosure.** A page shows its main job; "Tools" and "More" hold the rest.
6. **Almost no explanatory paragraphs** under headings.

## Where v3 is noisy now (counted on the Wall at 1366x800)
- Top bar in two rows with about 18 controls, including As-of, Build, Improve, Undo, three save buttons and a counts line that repeats the header band.
- The header band repeats the same counts again, then the left panel repeats them a third time (tab badges, section badges).
- Left panel (272px) always open, right panel (336px) always open and starts with a time-off form and list; the wall gets about 750px of 1366.
- Wall: window buttons, width buttons, axis buttons, a permanent two-line legend, then the grid.
- Inspector: header, status, working-here rows with rule text, who-can-work list, cell controls, date override, steppers, all visible at once.
- Setup and Plan pages open with a paragraph of help text. Travel, Rules and Checks are three more top-level tabs.
Result: roughly 45 controls on the first screen versus about 15 in the old District page.

## Plan (each step ends with a screenshot and all checks green)

### 1. Fewer destinations and one top bar (one row, 56px)
- Tabs: **Schedule** (wall, with a Wall / Plan switch inside), **Time off** (new, with the yellow waiting count), **Print**, **Setup**. Travel, Rules and Checks become tabs inside Setup (Stores, People, Patterns, Dates, Travel, Rules, Checks).
- Left: badge and file name with a quiet save state ("Saved 3:40 PM" or "2 changes not in a file"); right: Search, Undo, Save, File menu.
- **File menu** holds Open, Save As, Download a copy, Checkpoints and Revert, As-of date, Larger text, High contrast, Keyboard shortcuts, About. The As-of date shows as small text under the header number and is changed from there or the menu, not as a permanent input.
- Build and Improve leave the top bar (see 3).

### 2. One header band, no repeats
- Number, **three tiles only**: need cover, problems, out. Warnings and "cannot fully check" fold into the problems tile's detail.
- Two buttons: **Fix →** and **Someone's out** (yellow, palm). Month dial stays.
- Remove the counts line from the top bar and the badges on the left tabs; the band is the only place counts live.
- Default shorter (about 88px) on non-schedule pages: number, one tile, no actions.

### 3. A calmer wall
- Window controls become one line: previous, next, Today, a Month / 2 weeks choice, and the Stores / People switch. Build, Improve and Cover all open move into one **Tools** menu at the right end of that line.
- The legend leaves the page: a small "Key" link opens it as a hover list; it also stays in Setup > Checks.
- Row labels: hex badge and code only; the store's full name appears in the hover note and the Inspector.
- Cells stay initials and chips. Past days stay quiet.

### 4. Side panels that appear when needed
- **Left panel becomes a drawer**, closed by default. Fix →, the problems tile or the key `n` opens it; it holds Queue, To tell, History as three small tabs. When it is open the wall narrows; Esc closes it.
- **Right column is the Inspector only.** The Someone's out form and list move to the Time off page; the hero button opens a short form in the Inspector area and returns to the cell afterwards.
- Result: the wall gets about 1030px by default (about 20 days on screen instead of 14).

### 5. A lighter Inspector
- Top: store and date, one status sentence, and the one next step (Find cover, or Place someone).
- "Who can work here" shows the best three with a "Show all" link; consequences are one line each.
- Each assignment row shows name, one chip, one line; the rule explanation and Accept anyway open from a small "Details" link.
- Cell controls (accepted short, locum, close this day, extra clinic) sit behind one "More for this day" disclosure.

### 6. Less text everywhere
- Remove the explanatory paragraph under Setup, Plan, Travel and Print titles; keep one line at most, or move it into a hover note on a small "?" after the title.
- Confirmations are one line with Undo (done). Empty states get the old art and one sentence.
- Keep the old copy guide words (done in part).

### 7. New: Time off page (from the old build)
Waiting requests first (Approve / Deny with "what this leaves uncovered"), then upcoming, then add. This is where the Someone's out list now lives.

### 8. Measure and review
- Count interactive controls on the first Wall screen: target 18 or fewer (from about 45). Wall rows visible at 1366x768: at least 12. Wall days visible: at least 18.
- Screenshots of every page next to the old build's. Re-run axe, keyboard, stress and all e2e checks. Update the labels the tests look for in one pass.

## What stays
Everything the DM does is still there: nothing is removed, only moved behind a menu, a drawer or a disclosure. Hover notes carry the detail that leaves the page.

## Order and risk
Order: 1 and 2 (shell and band), 4 (drawer and right column), 3 (wall line), 5 (Inspector), 7 (Time off page), 6 (text), 8 (measure). The riskiest step is 4 because many tests assume the panels exist; the tests will be updated together with the change. No domain changes are needed for any of this.

## Separate debugging note (Build and Find cover speed)
Found while testing: on a deliberately hard synthetic month (about 80 to 180 open gaps, many same-date gaps), Build kept searching for minutes. Cause: the search tries every legal combination to rank the best three, and joint search over several same-date gaps multiplies the options. Strategy, in this order, each verified with a bounded single run (timeout, output to a file, one operation at a time):
1. A fixed budget of candidates per search (4,000, about 2 seconds) and one shared budget per Build (10 times that); when spent, say "Search limit reached; a solution may exist" and leave those gaps open. Counts, not clocks, so results stay repeatable.
2. Already done: search per date, deepening on people changed, delta evaluation, Build solves two same-date gaps at a time.
3. Same delta evaluation for Improve (now about 12 seconds on the hard month).
4. Benchmark on a realistic month (about 10 to 30 gaps), not the worst case, and keep the hard month only as a "does not hang" test.
