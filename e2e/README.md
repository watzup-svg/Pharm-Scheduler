# Browser checks

Quick end-to-end checks that drive the built app in Chromium: every page for script errors, sideways scroll and
accessibility (axe), plus the Time off and Print flows.

1. `npx vite build -c vite.spa.config.ts`, then serve `dist-spa/` (for example `python3 -m http.server 3002 -d dist-spa`).
2. `npm run e2e` (set `BASE` and `CHROME` if the app or Chromium live elsewhere).

The logic behind the schedule has its own fast tests: `npm run test:schedule`.

The copy for real use has its own short check: `npm run build:real`, serve `dist-real/` on port 3003
(`python3 -m http.server 3003 -d dist-real`), then `npm run e2e:real` (set `REAL_BASE` if it lives elsewhere).

Run one check by name: `npm run e2e -- header-links` (names are the ones printed as `# name`; several can be given).
Fast loop while editing: `npm run check` (type check + unit tests). See `ARCHITECTURE.md` for the whole map.

## Everything at once, cheaply

- `npm run all` builds the sample app, then runs the type check, unit tests and browser suite side by side. The screen gets one line per job; full output is in `test-logs/` (not committed) and `test-logs/latest.json`.
- `npm run e2e` serves the build itself on a free port and runs the groups three at a time (`E2E_JOBS=n` to change). Scratch files go in a per-run folder (`tmp()` in `lib.mjs`), so two runs at once never collide. `-- --serial` prints everything in one process (and uses `BASE`, default port 3002).
- `npm run sweep -- --seeds 200 --edits 3000` runs the rules-engine fuzz tests under many random seeds, one process per core, and writes `test-logs/sweep-*.json`. Reproduce one failing seed with `FUZZ_SEED=<seed> npm run test:schedule`.
- Tests that depend on the sample month: the browser groups open the built sample (fixed to October 2026), so they must not be pointed at the real build.
- `npm run deep` is `all` plus two deeper sweeps, all side by side (about 3 minutes here): the engine promises under random edits (`invariants.test.ts` and the fuzz tests, 30 seeds) and the page sweep (`npm run screens`: every page and a few day popups at 1366 and 390 wide, checking script and console errors, sideways overflow, leftover store letters, right-click notes opening and closing, and screenshots against a saved baseline). `npm run screens -- --accept` saves the current screens as the baseline (kept in `test-logs/baseline/`, not committed; a changed screen is reported by name and both images are kept). Reports are JSON in `test-logs/`.
