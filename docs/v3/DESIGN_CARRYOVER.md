# Bringing the old scheduler's look into v3

Goal: v3 should feel like the same product the DM liked (brand, picture language, dark header band with big numbers, month dial, mark chips, palm tree for time off), while keeping the section 27 rules: the wall is dominant, dense and calm, colour is state only and never alone, no popups as the only route to a fact (hover notes are allowed and the Inspector repeats them), no extra dashboards, desktop only.

## What the old build had, and what happens to each
| Old element | Where it lived | In v3 | How (adapted) |
|---|---|---|---|
| Hi-School badge | header, print, welcome | **Keep** | `app3/ui/brand.tsx` (official files copied to `app3/assets/brand`), top bar left, Start screen, printed packet |
| Rounded-square mark chips with pictures (no-coverage, twice, closed, licence, palm, route arrows) | marks.tsx, icons.tsx | **Keep, central** | `app3/ui/icons.tsx` (`StateMark`, `MARKS`, `RULE_MARK`): replaces the text glyphs (□ ! ▲ ?) on the wall, queue, inspector and legend. Each chip still comes with a word where it is explained |
| Dark hero band: big number, count tiles with icon chips, action buttons, hex pattern | every page | **Keep, slimmer** | `PeriodHero` (about 96px, not 270): big open count, tiles (open, problems, time off, cannot fully check), actions (Build, Cover all open, **yellow "Someone's out" with palm**), dial at right. Same template on Wall, Plan, Setup, Travel, Rules, Checks, Print so pages feel related. Collapsible to a one-line strip for people who want the wall higher |
| Month dial (ring of days, green/pink, hand at today) | district and schedule heroes | **Keep** | Ring over the current window; each day coloured by worst state from `evaluate`; click a day to jump the wall there. It is the navigator, not a new dashboard |
| District heat table with per-day coverage bars | district page | **Fold into the wall** | A thin coverage bar row under the date header (covered / required across all stores per day). The wall already is the store x day table |
| Person colour and avatars | schedule, people | **Keep as a quiet cue** | Deterministic colour per pharmacist (palette p0..p7 by id, not stored); a thin colour bar in the cell edge and an avatar disc in lists. Initials always carry the identity |
| Palm tree "away" theme (yellow) | time off, Someone's out | **Keep** | Time off chips and the Someone's out card are yellow with the palm; availability failures use it (with the words "does not count") |
| Covering green route arrows | cells | **Keep** | Shown when a pharmacist works away from their base store (derived from `baseStoreId`; reminder only) |
| Licence rings (OR / WA) and weekday bars | people hero | **Keep** | Setup > Pharmacists hero graphic, from the license tables |
| Paper stack graphic | print hero | **Keep** | Print view hero: pages in the packet, flagged ones marked |
| Empty-state art, hex pattern | empty screens, hero | **Keep** | Start screen and empty queues |
| Drive-time tag chip (amber over 90) | stores, people | **Keep** | Travel matrix and Inspector choices |
| Store numbers instead of letters (the "storeLabels" option) | File menu | **Restore** | `Store.number` + a display setting in Setup (data and preference live in the schedule); wall labels, queue and print follow it. The importer currently drops both: fix |
| Hover notes with "Title | line | line" | everywhere | **Keep (owner decision overrides section 27)** | `app3/ui/notes.tsx`: marker on hover, note on right click / Shift+F10, desktop only. Wall cells, chips, header tiles, dial days, travel cells get `data-tip`. The Inspector and legend still carry the same facts |
| Copy standard and name rule | everywhere | **Keep** | Full name when it fits, else first initial + last name, ellipsis last; neutral labels, warm guidance |
| Touch, long-press, mobile layouts, phone dial sheet | many | **Drop** | Desktop only |

## Order of work (small steps, each ends green)
1. **Assets and primitives** (done in this step): brand files, `ui/icons.tsx`, `ui/brand.tsx`. No screen changes yet, so nothing conflicts with the audits in flight.
2. **Chips everywhere**: wall cell markers, queue rows, inspector rule lines, legend and Setup Check legend use `StateMark`; wall cell keeps the word in its accessible name. e2e label checks updated.
3. **PeriodHero + dial**: one component, one prop set (`label`, `lead number`, `tiles`, `actions`, `graphic`), used by all views; wall gets the dial and the coverage-bar row. Screenshot compare with the old build at 1366x800.
4. **People and colour**: pharmacist colour bar, avatar discs, covering arrows, Setup licence rings, weekday bars.
5. **Print and empty states**: paper stack, badge on the packet, empty art.
6. **Store numbers**: model field, importer, Setup setting, labels.
7. **Visual QA and accessibility re-run**: axe, contrast on the chip colours and the dark band, keyboard order.

## Rules for this work
- Use the existing tokens in `app3/styles.css` (they are the old palette). No new colours.
- A picture never replaces a word in the Inspector, queue or legend.
- The hero must not push the wall off the first screen at 1366x768: wall header plus at least 10 store rows visible.
- Everything stays in one HTML file; images are inlined.

## Risks
- Height: the old hero was 270px. v3 needs the wall rows visible, so the slim hero plus a collapse control is the compromise to check by screenshot.
- Dial and tiles are decoration unless they navigate or act; each one must click through to something.
- Parallel edits: steps 2 to 5 touch the same view files the stress and accessibility agents are fixing; they start after those two merge.
