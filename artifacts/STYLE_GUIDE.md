# Hi-School Pharmacy scheduler: style

Live version: the **Style guide** page in the app (press `/`, type "style").

**Kept from the brief:** one action color, brand red `#C8102E` (the one primary button per screen, today, focus); selection is ink; wordmark red `#E82020` reserved for the logo artwork; night `#201820`; background `#F7F4EF`; cards `#FFFFFF`; hairline `#E6E1D8`; text `#1C1C1C` / `#5C5854`; errors and closed `#8C3A2F`; available and open `#2F6F4E` (status only); Source Sans 3 (Nunito Sans fallback), bundled so it works offline; no serif; radius 10; one filled red button per screen, everything else ink with a hairline; plain, local voice; no Divi blue, no sister-store badges.

**Where I made a call:**
- Error brick `#8C3A2F` sits close to brand red for some eyes, so no state relies on color alone: open = dashed, two places = ringed, license = dotted, closed = hatched, each with a word.
- "Ghost" secondary buttons keep a hairline so they still look tappable on a phone.
- Yellow stays for time off; light green tint stays for "covered".
- The official badge (red and black on white, supplied by the owner) is in `src/assets/brand/` and is used in the header, welcome screen, print previews and the PDF pack. A small hex icon, if supplied later as `hsp-icon`, replaces it in the header automatically. The PDF pack still uses Helvetica, since jsPDF needs the font file embedded separately.
- On phones narrower than 520 px the badge sits above the District header instead of in the top bar.

## Polish pass
Day panel beside the calendars on a laptop; drawers for add/edit; cards on phones; person color dots in calendar cells; larger poster names with a brand band and state tag; 12 px minimum text; branded toasts; quiet motion (off for reduced motion); Larger text and High contrast in the File menu; real OR/WA outlines on the map (bundled, from public Census boundary data); weekday letters and tooltips on the heat strip; Today strip, "since you were last here" line, month-by-month line and a three-tip tour on the District page; 404 page and per-page titles.

## Store labels and cards
Stores can be named by letters or by number. Store badges are black text on a white hexagon with one clean black outline; a small corner dot shows status (green fine, brick needs fixing, none when closed). Panels, list rows and tables use the single `surface` look.

## Theme by subject (applies on every page)

One subject, one colour and one picture, wherever it appears. This is how the app says "same thing" without words.

| Subject | Colour | Picture | Where it shows |
|---|---|---|---|
| A problem that blocks printing | light red `#efd8d2`, brick `#8c3a2f` | person-x, stacked squares, door, shield | marks, header tiles, grid, calendars |
| Someone is off (sick, vacation, appointment, family, waiting requests, "Mark out", "Add time off") | yellow `#f4e2a3`, brown `#7a4e08` | palm tree (generic), thermometer, stethoscope, heart, clock (waiting) | marks, tiles, nav badge, buttons (`variant="away"`), pills |
| Covering away from home | green `#dcebe2`, `#2f6f4e` | route arrows | marks, grid, calendars |
| Closed, left as is | grey | door, check | marks, legend |

Rules: marks come only from `marks.tsx` (`StateMark`); a button that starts an "off" action uses `variant="away"`; no state uses a circle; four mark sizes only (16, 20, 24, 28). `e2e/marks.mjs` checks sizes, shape and family colours on every page.

Cards: a card about one subject gets the subject's tab and glow with `accent-away`, `accent-problem` or `accent-cover` (next to `surface`): a 4 px left edge that follows the corners, and a faint glow fading out of it. A page about one subject can give its header a matching corner glow (`glow="away"`). Use it on cards that are *about* the subject, not on every card.
