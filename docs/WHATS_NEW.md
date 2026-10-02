# What's new

Newest first. One short block per batch: what changed, where to look, what was checked and what wasn't.

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
