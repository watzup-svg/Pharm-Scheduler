You are taking over development of the Hi-School Pharmacy month scheduler. Earlier notes in this project describe an OLDER version; where they disagree with the files below, the files below win.

FILES (all from the same snapshot, 2026-10-02, build v86): HiSchool_Scheduler_CONTINUE_2026-10-02.zip (full source, tests, build config, current built app), HANDOFF_CONTINUE_2026-10-02.md (READ THIS FIRST, end to end), and HiSchool_Pharmacy_Scheduler.html (the built app; open it in a browser to see it). If any of these are not in this project's files, stop and ask me to upload them before doing anything else.

THE APP IN FIVE LINES
A single-user, offline, pharmacist-only month scheduler for one district manager (about 18 stores, Oregon and Washington). A human decides who covers each shift: there is no auto-scheduler, ever; the app shows problems, who is free and what each choice would break, and prints a PDF packet. Stack: React 19, TanStack Router (hash SPA built to one HTML file), Tailwind v4, Zustand, Radix, jsPDF. The rules engine in src/lib/schedule is pure and tested; placeName is the only write gate. Do not change rules unless I ask.

RULES THAT MUST HOLD
Hard problems (block printing): an open store-day with nobody; the same pharmacist at two stores on one date; a name on a closed day; a pharmacist not licensed in that state. Warnings only: time off, covering away from home, "left as is". Time off is separate dates, not a range, and a date drops when the home store is closed. Floats keep a home store. A stamp never overwrites a filled cell. Next month carries by weekday occurrence. v1 files still open. Nothing assigns anyone by itself.

HOUSE STYLE (details in the handoff)
One mark system (marks.tsx): rounded-square chips, four sizes, no circles; problem = light red, someone off = yellow with a palm tree (including the "away" button variant), covering = green route arrows, neutral = grey. One header template on every page. One hover note per spot, format "Title | line | line". Copy standard in artifacts/COPY_GUIDE.md: neutral labels, warm guidance, full name when it fits, otherwise first initial plus last name ("M. Quenby"), cut with an ellipsis if still too long. Colour is never the only cue.

HOW TO WORK
1. For anything bigger than a small fix, state the plan and wait for my yes. I often ask for "strategy only, no changes": then change nothing.
2. If you can run code: unzip, npm install, run npx tsc --noEmit -p ., npm run test:schedule (expect 272 pass), npx vite build -c vite.spa.config.ts, serve dist-spa on port 3002, npm run e2e (expect "all checks passed"). After every change set, rerun them and update tests that depend on changed wording or structure. Look at screenshots at 1366 and 390 px.
3. If you cannot run code: say so plainly, read the files, and give me complete replacement files (never fragments), one change set at a time, plus the exact test commands for me to run. Never claim a test passed that you did not run.
4. Report what changed, what you checked, and what you did not (real printers, iOS Safari, real touch, real road times are untested).

START NOW
Do not change anything yet. Read the handoff, then reply with: (a) a status of the project in 10 lines or fewer, including whether you could run the tests; (b) the first three backlog items from section 7 of the handoff, with one sentence each on what you would do; (c) the three questions you most need me to answer. Then wait for me to choose.
