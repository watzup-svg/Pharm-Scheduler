> **Superseded in part (2026-10-01):** the page-header heroes and charts discussed below were built and then removed in the strip-down. The current screens are described in `README.md`.

# Design inspiration research for the Hi-School scheduler (2026-10-01)

## 1. The request, rewritten and expanded

**Goal.** Find existing apps, websites and design systems whose style and interaction patterns we can learn from, then say exactly what to borrow for the Hi-School Pharmacy month scheduler (one district manager, phone and laptop, offline, pharmacists only, human decides, no AI).

**Cover each of these dimensions, with a concrete "borrow / do not borrow" for this app:**
1. Products that solve the same problem: multi-location staff scheduling, coverage gaps, time off, conflict warnings, printed schedules, and pharmacy-specific tools.
2. Design systems and reference apps with strong visual language: colors and status colors, textures and surfaces, buttons, icons and graphics, spacing and type, borders, motion and animation.
3. Task flow: how the best tools make the next step obvious (checklists, steppers, "next problem" buttons, status tags).
4. Contextual toolbars: how the controls at the top of a window change with the task (selecting, placing, reviewing, printing).
5. Phone vs laptop patterns for calendars and rosters.
6. Constraints that stay fixed: color and icon cues that carry meaning stay; no auto-scheduling or AI; offline; pharmacists only; nothing relies on color alone.

**Deliverable.** What I found (with sources and how strong the evidence is), a ranked list of what to adopt, and a mapping onto our screens. No code changes in this pass.

## 2. How reliable this research is

- Web search worked; direct page fetches were blocked by the network proxy (Carbon, GOV.UK, Legion, saasui). So the findings below come from search-result summaries, not from reading the full guidelines. Treat them as pointers, not quotes.
- I could not view competitor screenshots. Where I describe what an app "looks like", that is from my own knowledge and is marked (own knowledge).
- Vendor blog posts (scheduling software, pharmacy tools) are marketing; I use them for feature lists only.

## 3. What exists

### 3a. Products solving the same problem
| Product | What it does well (source) | What it does badly / does not fit |
|---|---|---|
| Sling, Homebase, Deputy, When I Work, 7shifts | Color-code by role or location; auto-flag conflicts, double-bookings, someone scheduled on a day they marked unavailable; overtime warning as you build; copy last week/templates ([Sling and Homebase summaries via Connecteam/Clockify](https://clockify.me/blog/apps-tools/best-scheduling-software/), [Homebase help](https://support.joinhomebase.com/hc/en-us/articles/360050896152-Scheduling)) | Built around hourly staff, shift-claiming marketplaces and auto-scheduling. Our app deliberately has neither. Their grids are "people x days", which hides the thing she cares about: is each store covered? |
| Pharmacy-focused tools (Legion, Schedule360, Netchex, Shifton) | Licence/credential tracking with expiry alerts, multi-state licensure, cross-site scheduling, ratio rules ([Legion](https://legion.co/blog/pharmacy-scheduling-software/), [Netchex](https://netchex.com/pharmacy-hr-payroll-software/)) | Marketing-grade evidence. Heavy HR/payroll suites. Our licence-by-state rule engine already does the core of this. |
| Google Calendar (Material 3 Expressive) | Month view where each date is its own rounded card; tonal backgrounds instead of faint gridlines; rounded content container on a tinted frame ([9to5Google](https://9to5google.com/2025/08/07/google-calendar-material-3-expressive-redesign/), [web redesign](https://9to5google.com/2024/10/23/google-calendar-material-you-redesign-dark-theme/)) | General-purpose; no concept of "gap". |
| Fantastical, Notion Calendar | Grid and scrollable timeline together; quick toggle month to agenda; keyboard shortcuts; polished micro-interactions ([efficient.app comparison](https://efficient.app/compare/notion-calendar-vs-fantastical)) | Personal calendars. |

### 3b. Design systems and style references
| Reference | Takeaway | Source |
|---|---|---|
| Linear's interface refresh | Reduce visual noise while keeping structure: dim the navigation so content leads, fewer and smaller icons, remove decorative colored icon backgrounds, soften borders; rebuilt theme colors in LCH so a red and a yellow at the same lightness feel equally strong | [Linear: a calmer interface](https://linear.app/now/behind-the-latest-design-refresh), [changelog](https://linear.app/changelog/2026-03-12-ui-refresh) |
| IBM Carbon status indicators | A status should use at least two of color, shape, symbol; pair icon with label; icons alone need 3:1 contrast | [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/) (via search summary) |
| GOV.UK task list | A list of tasks each with a status tag: Not started, Cannot start yet, In progress, Completed; whole row clickable; hint text under each task. Use it when users may do tasks in any order | [GOV.UK task list](https://design-system.service.gov.uk/components/task-list) (via search summary), [HMRC status tags](https://design.tax.service.gov.uk/hmrc-design-patterns/status-tags-in-task-list-pages) |
| Material Design contextual action bar | The top bar transforms during a selection: color changes, back arrow becomes a close X, the title becomes "N selected", normal actions are replaced by actions for the selection; it stays until you act or dismiss | [Material app bars](https://m2.material.io/components/app-bars-top), [Selection](https://m2.material.io/design/interaction/selection.html) |
| Progressive disclosure | Show the essentials first and reveal detail on demand; warn about a conflict at the moment of choosing, not after | [UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/), [saasui calendar patterns](https://www.saasui.design/blog/saas-calendar-scheduling-ux-patterns) (search summaries) |

## 4. What to borrow, ranked (value for her / effort / risk)

| # | Idea | From | What it means here | Value | Effort | Risk |
|---|---|---|---|---|---|---|
| 1 | **Task-aware top bar** (contextual action bar) | Material | One slim bar under the main nav that changes with the task. Schedule: view switch, Today, person, Place a person. Placing: bar turns green, shows "Placing Marisol", Done (the strip we already have, moved into the bar so nothing shifts). Time off: Add time off, filter. Print: Print, Save PDF, paper. Day panel: close, Undo. Everything now scattered through page bodies moves to one predictable place | High | M | Low-Med |
| 2 | **Month as an ordered path with status tags** | GOV.UK task list | The existing hidden checklist becomes a four-row strip on District: Time off decided, Gaps filled, Problems cleared, Printed, each with a tag (Waiting, In progress, Done) and the whole row clickable. Note: the order is mostly fixed, so it is a stepper, not a free-order task list | High | M | Low |
| 3 | **Agenda view for phones** | Fantastical | On a phone, default to a day-by-day list per store (date, who, status icon) instead of seven tiny calendar columns where names show as "Ma…". Month grid stays one tap away | High | M | Med |
| 4 | **Calm the chrome, not the signals** | Linear | Keep every status color, icon and tile. Remove only decorative treatments: the hex pattern behind everything but the hero, colored backgrounds on non-status icons, double borders. Dim the nav bar. Soften borders (we use 1.4:1 hairlines already) | Med | S | Low |
| 5 | **Perceptually even status colors** | Linear (LCH) | Re-pick brick, amber and green in OKLCH so no state shouts louder than its severity warrants; check that the three still differ with color removed (we already use dash, ring, dot and hatch) | Med | S | Low |
| 6 | **Tonal surfaces instead of outlines** | Google Calendar | Page tinted, content on a rounded white container, date cells as soft cards. Fewer lines, same grouping | Med | M | Low |
| 7 | **Warn at the moment of choosing** | Sling/Homebase, UX writing | We already glow valid days and show reasons. Extend to the keyboard/"Schedule" pill path: show the consequence inline before the tap ("leaves Rick's with no coverage") | Med | S | Low |
| 8 | **Sort the status vocabulary** | Carbon | One short severity ladder with exactly one icon and one color per rung: no coverage, two places, name on closed day, not licensed, time off, cover, left as is. Audit that no state shares an icon | Med | S | Low |
| 9 | **People x days "swim lane" view** | Sling/Homebase grids | Optional second lens: rows are people, columns days, to see who is overworked or idle. Previously deferred; still the largest unbuilt idea | Med | L | Med |
| 10 | **Licence expiry date + reminder** | Pharmacy tools | Store an expiry date per licence and show "expires in 30 days" on People and as a "worth a look" line. A capability, not a style change; needs her confirmation that she tracks this elsewhere | Low-Med | M | Low |

**Do not borrow:** shift marketplaces, claim-and-approve flows, auto-scheduling, labor-cost forecasts. They answer a different job and fight the rule that the human decides.

## 5. Motion, texture and graphics (own knowledge, informed by the references above)
- **Timing:** 150 to 200 ms ease-out for state changes, 250 ms for panels. Already close (`hs-fade`, `hs-rise`, `hs-slide-in`).
- **Reward moments only:** a short check pop when a hole is filled and when "Ready to print" turns on. Keep the hold-fill sweep for one-shot decisions.
- **Continuity:** when a day opens its panel, slide from the tapped cell so she keeps her place.
- **Texture:** keep the hex pattern as a brand signature on the hero only; use flat tonal fills elsewhere.
- **Icons:** one stroke weight and one size family (we use lucide); fewer, larger; always paired with a word when it stands alone.

## 6. Suggested order of work
1. Calm the chrome and even out the status colors (4, 5, 8): quick, low risk, visible everywhere.
2. Task-aware top bar (1) and the month path strip on District (2): fix "where do I go next" and "where are my controls".
3. Phone agenda view (3): the biggest phone fix, so test it with her before polishing.
4. Tonal surfaces (6) once the structure settles.
5. Later: swim-lane (9) and licence expiry (10) if she asks for them.

## 7. What would change these conclusions
- Watching her use it for one real month (the evidence here is from other products, not from her).
- Full reads of the Carbon and GOV.UK guidelines (blocked this run).
- A real phone test of the agenda idea versus the existing calendar.

## 8. Golden nuggets to steal (added on request)
Evidence key: S = from a source above, K = my own knowledge of the product (not verified this run).

### Whole UI styles worth considering
| Style | Look and feel | Fit | Evidence |
|---|---|---|---|
| Linear "calm" | Dim chrome, content leads, tiny quiet icons, soft borders, one accent | Best match for "less busy": keep our status colors, drop decoration | S |
| Google Calendar Material 3 | Tinted frame, white rounded content container, each date a soft card | Good for the calendars; fits our cream/paper palette | S |
| Things 3 / Apple Reminders | Lots of air, one big title, one obvious "next" action, gentle completion animation | Good for District: "what is next" | K |
| Stripe Dashboard | Dense but readable: quiet gray text, status as small colored dot plus word, tables with sticky headers | Good for People, Stores, Time off lists | K |
| GOV.UK | Plain words, big type, one question per screen, status tags, whole row clickable | Good for Add time off and Start next month | S |

### Golden nuggets, by area
**Flow and navigation**
1. **One "next" button that moves with you** (Things, Linear triage): after fixing a hole, the primary button becomes "Next problem (7 left)" and stays in the same spot. We have "Fix the next one"; make it persistent in the day panel footer.
2. **Status tags on a path** (GOV.UK): Waiting, In progress, Done on each month step; the whole row is a button.
3. **Contextual top bar** (Material): the header transforms during placing, selecting or printing, with a close X and only the actions that matter.
4. **Back always works** (iOS large titles): a small "‹ District" at the left of the top bar on any page opened from District, instead of a breadcrumb.
5. **Remember where I was** (Fantastical): returning to Schedule lands on the same store and day. We do this; make it visibly obvious with a brief highlight on the cell.

**At-a-glance reading**
6. **Dot plus word** (Stripe): status as a small colored dot with a word, not a big pill, in lists. Pills stay for the headline counts.
7. **Same-lightness status colors** (Linear's LCH): brick, amber, green balanced so none shouts.
8. **Severity ladder** (Carbon): one icon and one color per rung, never reused.
9. **Heat strip with a "today" marker and weekend shading** (GitHub contribution graph style, K): we have the strip; add a subtle today column.
10. **Soft date cards** (Google Calendar): each day its own rounded card; gaps get a dashed outline.

**Phone**
11. **Agenda list** (Fantastical): day-by-day list per store instead of tiny grid cells.
12. **Bottom sheet that rises from the tapped item** (Apple Maps, K) for the day panel, with three snap heights: peek, half, full.
13. **Thumb-zone actions** (iOS/Android): primary actions at the bottom of sheets, not the top.
14. **Swipe a day left/right** to go to the next/previous day in the sheet (Google Calendar day view, K).

**Making a decision**
15. **Show the consequence before the tap** (Sling/Homebase conflict flags, S): "leaves Rick's with no coverage" right on the suggestion.
16. **Undo toast with a countdown bar** (Gmail "Undo send", K): visible 6-second timer, bigger Undo.
17. **Smart default, one tap to change** (Calendly, K): sick-call date defaults to today, person list sorted by who is scheduled today.
18. **Best option first, others collapsed** (Apple Pay, K): "Best fit" card on top, "See 5 others" below.

**Feel**
19. **Completion moment** (Things, Duolingo-lite, K): a short check animation when the last problem clears and "Ready to print" appears.
20. **Press and hold with visible fill** (iOS delete, Slack, K): already built; consider a haptic-style tiny scale on start.
21. **Skeleton and empty states with one clear next step** (Notion, K): every empty list shows a single button, not just text.
22. **Keyboard command palette** (Linear, Notion Calendar, S/K): we have search with "/"; add verbs ("Add time off for…", "Go to Estacada Oct 21").

**Print**
23. **Live preview that updates as options change** (Google Docs print, K): we have a preview; make the paper-size and clean-copy switches update it instantly.
24. **A "ready to post" checklist stamp** (airline boarding pass logic, K): one visible line "No gaps · No doubles · Clean copy" on the printed page.

### Biggest three to steal first
1. Contextual top bar (Material) with the persistent "Next problem" button (Things/Linear).
2. Phone agenda list with a snap-height bottom sheet (Fantastical + Apple Maps).
3. Calm chrome with LCH-balanced status colors (Linear), keeping every signal.
