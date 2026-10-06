# Pressure test (v3)

`npm run pressure:v3 -- --level low|medium|high` pushes the v3 domain, save layer and UI past normal use and writes one report an AI can read cheaply and debug from. No AI tokens, no network, seeded: the same level on the same code runs the same cases.

```
npm run pressure:v3:low                                   # about 2 minutes: every change set
npm run pressure:v3 -- --level medium                     # about 10 minutes: nightly, before handing over a build
npm run pressure:v3 -- --level high                       # about 30 minutes: weekly, before a big release
npm run pressure:v3 -- --level medium --only domain-fuzz  # one suite (comma list or prefix* also work)
npm run pressure:v3 -- --list
```

Same tests at every level; the level scales seeds, steps, world size and the time cap. Needs Chromium for the `browser` suite (default `/opt/pw-browsers/chromium-1194`, override with `CHROME=`). The suite builds `dist-v3/v3.html` itself if it is missing or older than `app3/`, `domain/src/`, `persist/`.

Exit code is 0 when no case failed, 1 otherwise. "Known open" observations (documented in HARDENING.md) are reported but do not fail the run.

## What it writes

```
test-logs/pressure-v3-<stamp>-<level>/
  REPORT.md        read this first
  report.json      every case, machine readable; the next run diffs against it
  <suite>.log      full output of each suite
  <suite>.result.json
  screenshots/     browser failures
  hostile/         the damaged files that broke the loader (first 5 per class)
  browser-*.log, browser-soak-samples.json, seed-N.json (monkey action lists)
test-logs/pressure-v3-latest -> newest run
```

## How to read REPORT.md

1. Title line: `PASS`, or `FAIL (n failing cases)`. Header: commit, level, duration, Node and Chromium versions.
2. **Results**: one row per suite when everything passed (case count, summed ms, the suite's time cap); one row per case for anything that failed or is known-open. `ms` and `Budget` are milliseconds.
3. **Slowest 10**: the ten slowest cases with the share of their budget used. Anything above about 60% is a future failure.
4. **Key numbers**: max Build/Repair/Improve ms, search-limit hits, files loaded, render ms, frame gap, heap and DOM start/end.
5. **Regression diff** against the previous report of the same level: newly failing, fixed, more than 25% (and more than 300 ms) slower.
6. **Failures** (only when there are some). Per failing case: the invariant that broke, what happened, a one-line **Replay** command (a `--case` id, a seed, or a monkey action file), the state hash, a screenshot path for browser cases, the last 20 actions and a trimmed stack trace.
7. At the bottom a "Paste this to Claude" block with the prompt to use.

A green run is 1 to 3 KB. A failing run grows only by the failure sections.

## Suites

| Suite | File | What it checks |
|---|---|---|
| `domain-fuzz` | `suites/domain-fuzz.ts` | Seeded random edits (every edit type), undo, redo (undo of the undo), checkpoint and revert, engine proposals (Build/Repair/Improve accepted), what-if scenarios, on generated worlds of 18 and 60 stores (120 only with `PRESSURE_EXTREME=1`). After every step `checkIntegrity` is empty; a refused commit leaves the hash alone; undo restores the pre-commit hash, redo the post-commit hash, revert the checkpoint hash; at the end the journal replays to the live state. Case ids `n18-s1`, `n60-s2`, ... |
| `search-soak` | `suites/search-soak.ts` | Build, Repair (normal and wider, 3 gaps) and Improve over generated months of seven world shapes: normal, dense, sparse, all-unavailable, licensing-hostile, one-person stores, closed weeks. Odd months use a mid-month as-of date so the past is protected. Fails on a throw, a call over its time budget (15 s Build, 8 s Repair, 12 s Improve per 18 stores, scaled by store count), an accepted proposal that breaks integrity, a rule Fail on a placement Build created itself (soft policy Fails on pattern placements are by design and ignored), moved past assignments, a Build that is not idempotent, cells still open that `unresolvedGaps` did not list, a Repair option that leaves its gaps open or hides new Fails, an Improve that raises Fails, open or unverified counts. Records ms, edits, unresolved, `searchLimitHit` (limit hits are counted, not failures). The domain exposes no node counter, so "nodes" are not recorded. |
| `determinism` | `suites/determinism.ts` | A digest (world hash, evaluate, Build, state after Build, Repair, Improve) must be identical for a second run in the same process, with every input list shuffled, and in two fresh child processes with different `TZ` and `LANG`. |
| `hostile-files` | `suites/hostile-files.ts` | Valid files from `persist/codec` (practice month, a busy journal, a generated world) are damaged thousands of seeded ways: truncation, bit flips, garbage pages, header bytes, wrong versions and meta, emptied or dropped tables, huge strings, duplicate keys, wrong JSON shapes, journal damage, and hash-consistent damaged state. The loader must refuse (`ok:false` or a `CodecError`) or load a world whose problems equal `checkIntegrity`, that `evaluate` can still read, in under 8 s; never an uncaught throw. Journal edits are not covered by the file fingerprint: files that load with an altered journal are counted (`journalAltered`) and the journal is exercised (undo, checkpoint, post). |
| `persistence-torture` | `suites/persistence-torture.ts` | A model-based fuzz of `persist/core.ts` on the persist test fakes: failed write mid-save, a writer that corrupts one write, browser storage full (`idbMem._failPuts`), kill at any point followed by a boot on the same storage, permission revoked, adopt after checkpoint. Invariants: a failed save leaves the file byte-identical and says so; storage failures are visible in `status()`; after every boot the world equals the newest durable copy, or recovery offers both sides; the download fallback loses nothing. A separate case reproduces the two-windows stale copy (known open, HARDENING item 4). |
| `browser` | `suites/browser.mjs` | (1) `stress/v3-monkey.mjs` with seeds and actions per level; a failing seed is replayed and minimized with the monkey's own `MINIMIZE`. (2) The 40 / 60 / 60 store world (low / medium / high; 120 stores and 500 people with `PRESSURE_EXTREME=1`) loaded through the store's `setWorld`: render time, no console errors, no horizontal page scroll at three laptop sizes, view switch, cell click and key times, and Build off the main thread (longest frame gap). (3) Fault injection from outside the app (`addInitScript`): engine Worker terminated mid-Build, Workers blocked (in-page fallback), a 3 s slow engine, IndexedDB `put` throwing quota errors, IndexedDB unavailable, network offline; on every page any request that leaves the machine fails the case. (4) Soak: 400 / 2000 / 6000 mixed actions (cell clicks, keys, views, drawer, window shifts, edit+undo, what-ifs) sampling JS heap after GC, DOM nodes, listeners and history size; fails on sustained heap growth beyond a cap (12 MB or 40%, plus 60 KB per change set), DOM growth, or listener growth. |

## Levels

| | low | medium | high |
|---|---|---|---|
| domain-fuzz | 1 seed per size, 120/70/45 steps | 3 seeds, 400/250/150 | 8 seeds, 1000/600/400 |
| search-soak | 18 stores x 7 shapes x 1 month, 40 stores x 1 | 18 x 7 x 3 months, 40 x 4 shapes x 2 | 18 x 7 x 6, 40 x 7 x 3, 60 x 3 x 2 |
| determinism | 2 shapes | 7 shapes x 2 months, 40 stores | + more months and shapes |
| hostile-files | 120 files per class | 600 | 2,500 |
| persistence-torture | 8 sequences x 160 steps | 30 x 260 | 90 x 400 |
| browser | monkey 2x50, soak 400, one laptop size | monkey 10x120, soak 2000, two sizes | monkey 30x200, soak 6000, three sizes |

Each suite also has a time cap (shown as "suite cap" in the report). When the cap is reached the suite stops starting new cases and reports how many were not started; that is not a failure, but a run that skips cases is weaker than one that did not.

## Replaying a failure

Every failure prints a one-line replay:

- Node suites: `node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/<suite>.ts --level <level> --case <case id>`. The case id fixes the seed, so the failure reproduces exactly. Add `--iter N` to `hostile-files` to rerun one damaged file.
- Browser: `node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/browser.mjs --level <level> --case <case id>`.
- Monkey: `REPLAY=<action file> SEED=<seed> node --experimental-strip-types --no-warnings stress/v3-monkey.mjs`; add `MINIMIZE=1` to shrink it (the report already ran this and names the `.min.json`).

## Adding a suite

1. Create `scripts/v3-pressure/suites/<name>.ts` (or `.mjs`). Import `parseArgs`, `runSuite`, `Invariant`, `pick3`, `rng`, `genWorld` from `../lib.ts`.
2. Build a list of cases `{ id, budgetMs?, run(ctx) }`. `run` throws (preferably `new Invariant("name", "what happened", { replay, actions, stateHash })`) to fail, calls `ctx.note(text)` and `ctx.metric(key, number)` for the report, and `ctx.known(text)` to record a documented open issue without failing. Make ids encode the seed so `--case <id>` replays.
3. End the file with `await runSuite("<name>", cases, parseArgs());`. It writes `<name>.result.json` into `--out` and exits non-zero on failure. Honour `args.level` for scale (`pick3(level, low, medium, high)`); `runSuite` applies `--budget-sec` for you.
4. Register it in the `SUITES` array in `scripts/v3-pressure/run.mjs` with soft time caps for the three levels.
5. Add its row to the tables above.

Suites must stay deterministic (seeded, no `Math.random`, no wall-clock decisions) and read-only with respect to app code; fault injection from the browser goes through `addInitScript` or `route`, never by editing `app3/`.

## Budgets

Time budgets are deliberately loose (about 4x what the current code needs on a 4 core machine) so they flag regressions, not noise. The ones to adjust when the code gets legitimately slower or faster are in `suites/search-soak.ts` (`bud`), `suites/browser.mjs` (`B`) and `suites/hostile-files.ts` (`LOAD_BUDGET_MS`). The regression diff in the report is the finer instrument: it flags any case that got more than 25% slower than the previous run of the same level.


## Why high stops at 60 stores
Real use is 16-18 stores. 60 is about 3x, which is enough to expose code that grows faster than the data (Improve and the candidate list were quadratic and first showed at 60). 120 stores / 500 people (7x) mostly repeats those findings at higher cost, so it is kept for an occasional deep look: `PRESSURE_EXTREME=1 npm run pressure:v3 -- --level high`.
