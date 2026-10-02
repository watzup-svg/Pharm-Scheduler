# What's new

Newest first. One short block per batch: what changed, where to look, what was checked and what wasn't.

## Checks (no visible change to the app)
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
