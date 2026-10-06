# Test commands (v3)

Every test is a plain Node or Playwright script: deterministic, no network, no model calls. Token cost of all of them: none. Runtimes are on a 4 core machine. Build first for anything that opens the app: `npm run build:v3`.

| Command | What it catches | Runtime |
|---|---|---|
| `npx tsc --noEmit -p domain` / `-p app3` | Type errors in the domain and the app | 5 s each |
| `npm run check:v3` | Types, all domain unit tests (rules, golden fixtures, hash, corruption, import, fuzz, choices equivalence), persistence tests | 30 s |
| `node --experimental-strip-types --test domain/test/choice-equiv.test.ts` | The Inspector's one-candidate judge (`judgeChoice`, behind `choiceFor`) differs from "copy the schedule, apply the edit, evaluate everything", on 7 world shapes, with and without overrides | 1 s (part of check:v3) |
| `node --experimental-strip-types --test domain/test/choices-equiv.test.ts` | The same for the whole candidate list (`choicesFor`) | 1 s (part of check:v3) |
| `npm run pdf:v3` (`node scripts/v3-pdf-check.mjs`) | The print PDF (practice month and a 40 store month, letter and tabloid two-up): valid header/trailer, page count (expected table in the script), blank pages, every store code and every set of initials on the paper, byte-identical on a second build. Also runs in `check:all` phase 1. No `pdftotext` needed (text is read from the uncompressed content streams; used as a second opinion when installed) | 2 s |
| `node scripts/v3-e2e.mjs [name]` | Runs every `e2e/v3-*.mjs` below one after another | 4.5 min |
| `node e2e/v3-wall.mjs` | The schedule wall: cells, selection, keys, drag, windows | 6 s |
| `node e2e/v3-scale-keyboard.mjs` | 120 stores / 500 people: grid semantics (`aria-rowcount`, `aria-rowindex`), only a window of rows in the DOM, arrows / Home / End / Ctrl+Home / Ctrl+End / PageUp / PageDown, active cell scrolled into view and drawn, one Tab stop that is never on an unmounted row, Tab out and Shift+Tab back in, Enter and Space select and the Inspector follows; both Stores and People | 18 s |
| `node e2e/v3-layout.mjs` | 5 viewports (1024x700 to 1920x1080) x normal / larger text / high contrast / both x 11 screens (Schedule, Time off, Print, Plan, 7 Setup tabs): sideways page scroll, boxes past the edge, text clipped in buttons and tabs, top bar on one row at 1280+, console errors. Prints failures as `viewport\|mode\|screen\|selector\|detail`. 1024 is below the shell's 1280 minimum, so it is checked against 1280 | 26 s |
| `node e2e/v3-locale.mjs` | 16 browser contexts (Auckland, Honolulu, Los Angeles, UTC x en-US, de-DE, ar-EG, ja-JP) with a frozen clock: wall headers, Schedule, Time off, Print text, print model, PDF bytes, domain state hash and open-cell count must be identical; no NaN / Invalid Date / undefined | 30 s |
| `node e2e/v3-a11y.mjs`, `v3-chrome.mjs`, `v3-engine.mjs`, `v3-inspector.mjs`, `v3-persist.mjs`, `v3-print.mjs`, `v3-reference.mjs`, `v3-resilience.mjs`, `v3-setup.mjs`, `v3-windows.mjs` | Accessibility (axe and keyboard), top bar / drawer / Plan, engine worker, Inspector, save and recovery, post and print, reference data, crash and worker faults, Setup, one editing window | 3 to 90 s each |
| `domain/test/rule-oracle.test.ts` | Independent re-implementation of the rules and coverage compared with `evaluate` on random small worlds (`ORACLE_N` to scale, `ORACLE_SEED` to replay) | 13 s (part of check:v3) |
| `domain/test/search-completeness.test.ts` | Brute force over every repair on tiny worlds: missed fixes, wrong top 3, wrong declared metrics; Build never touches manual/pinned, no fillable gap left, idempotent | 13 s (part of check:v3) |
| `domain/test/metamorphic.test.ts` | Renaming ids, shifting dates, adding unrelated records, reordering records, commit/accept then undo: answers must match or return the exact hash | 17 s (part of check:v3) |
| `domain/test/dates-differential.test.ts` | The date code against JavaScript `Date` for every day 1899 to 2101, leap years, DST, invalid input | 1.4 s (part of check:v3) |
| `domain/test/import-fuzz.test.ts`, `export-injection.test.ts` | Importer never throws on mutated old files; CSV and file names cannot run as spreadsheet formulas | 15 s / 0.2 s (part of check:v3) |
| `persist/test/compat.test.ts` | Every saved-file fixture from every schema version still opens, hashes and re-exports identically; a newer file is refused | 1 s (part of check:v3) |
| `node e2e/v3-month-in-the-life.mjs` | The district manager's whole workflow through the real UI (22 steps) with integrity, journal replay and on-screen counts checked after each step | 21 s |
| `node e2e/v3-problems-demo.mjs` | The "practice month with problems" opens from the Start screen (16 stores, waiting requests, a notice) and Build and Improve run on it | 20 s |
| `domain/test/demo-problems.test.ts` | That schedule is valid, the same on a given day, and really contains every kind of problem (open shifts, availability, closure, days in a row, double booking, licensing, long drive, surplus, waiting requests, someone to tell) for any start date | 3 s (part of check:v3) |
| `node e2e/v3-races.mjs` | 21 re-entrancy scenarios (double Build, edit during search, Save during Build, worker killed, ...): never busy forever, one proposal, journal replays | 60 s |
| `node e2e/v3-visual.mjs` | 27 screenshots vs `e2e/baselines/` (`UPDATE_BASELINES=1` to accept a change on purpose) | 13 s |
| `node e2e/v3-print-browser.mjs` | The browser print path: sheet size, clipping, page counts, text, stable second print | 17 s |
| `node e2e/v3-hostile-text.mjs` | About 24 hostile strings in every text field shown on every screen, print and PDF, then saved and reopened | 25 s |
| `npm run size:v3` | Bundle size budget and dependency licences | 2 s |
| `npm run build:repro` | Two builds are byte-identical | 15 s |
| `npm run perf:baseline` | Domain timings vs `scripts/perf-baseline.json` (fails on more than 40% and 150 ms slower; `UPDATE=1` to re-baseline) | 21 s |
| `.github/workflows/check.yml` | The same checks on every push (and nightly medium), with Firefox and WebKit legs | CI |
| `npm run stress:v3` | Random clicking and typing (seeded), minimises a failing run | 1 to 5 min |
| `npm run pressure:v3:low` (`--level medium\|high`) | Domain fuzz, search soak, determinism, hostile files, persistence torture, browser scale and faults and soak; see PRESSURE.md | 2 / 10 / 30 min |
| `npm run check:all` (`:quick`) | Everything above in the right order, with one report in `test-logs/check-all-latest/REPORT.md` | 10 min (5 quick) |

Conventions: a browser test prints `ok` / `FAIL` lines through `e2e/v3-lib.mjs` (`check`, `failed`) and exits non-zero on failure; `scripts/v3-e2e.mjs` picks up any `e2e/v3-*.mjs` by name. Do not weaken a check to make it pass.
