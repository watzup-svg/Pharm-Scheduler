# v3 status

Branch `v3/foundation` (not merged; `main` untouched). Prototype `npm run check` green; new `npm run check:v3` green (38 tests: dates, hash, engine, 19 golden fixtures, import comparison).

| Phase | State | Where |
|---|---|---|
| 0 Read and report | done | reported in chat |
| 1 Persistence spike | done, Chromium/Linux only | `docs/v3/PHASE1_PERSISTENCE.md`, `spikes/persist/` |
| 2 Spec and golden tests | done | `docs/v3/DOMAIN_SPEC.md`, `domain/fixtures/*.json` |
| 3 Headless domain | done | `domain/src/` (no DOM, no clock, no locale; guarded by a test) |
| 4 Importer + comparison | done on sample, demo and saved-v2 files; **not yet run on a real month** | `domain/src/import-v2.ts`, `scripts/v3-compare.ts` |
| 5 UI port | not started; stops here for approval | `docs/v3/UI_REVIEW.md` has the section 27 take |

## Run
`npm run check` (prototype), `npm run check:v3` (domain), `node --experimental-strip-types scripts/v3-compare.ts month.hisp.json ...` (old vs new counts for a real file).

## What the domain does
evaluate (one coverage function, 7 rules in one registry), commit/undo by key, checkpoints and revert, one proposal and one scenario (park, stale), posting snapshots, To-tell ledger, Build (idempotent), Reset to Pattern, Repair (joint search, lexicographic order, node-count limit), Improve, integrity check.

## Not done / not verified
- No real month compared yet. Send one `.hisp.json` and run the compare script.
- Persistence: real picker, Firefox, Safari, Edge, Windows, OneDrive untested. SQLite save layer is a spike, not wired to the domain.
- Fixtures were hand-computed by me and three helpers from the spec; they prove the code matches my reading of the rulings, not that the reading is right. Read `DOMAIN_SPEC.md` section 15.
- Repair/Improve speed on a full 18-store month is unmeasured.
- UI, PDF, print: untouched.

## Decisions I made (reversible, `DECISIONS.md` and spec section 15)
Licensing not overridable; posting never blocks; Build never adds off-duty shifts; two-pharmacist days import as requirement 2; `rest` rule not defined.

## Needed from the owner
1. Browser and computer the DM uses; OneDrive/Dropbox? (decides the save design)
2. Time off as separate dates (kept) or ranges?
3. OK to start Phase 5 (wall UI replacing the month grid)? It changes prototype behavior.
