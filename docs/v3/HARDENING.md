# Hardening, speed and what is still open

## Measured and fixed
| Area | Before | After | How |
|---|---|---|---|
| Find cover, one gap, 18 stores x 45 pharmacists x 31 days | 50 s | about 1 s | evaluate only the gap dates, copy-on-write scratch states, cached indexes, no override clean-up inside the search, early pruning of chains that cannot close |
| Improve, practice month | 14 s | 1 s | prefilter swaps (only moves that restore a pattern, cut drive time, or touch a failing assignment); judge one day at a time |
| Who can work here (Inspector) | slow enough to lag selection | 34 ms for 20 people | same windowed evaluation |
| Date compare | Array.from per call | char codes | `cmp` fast path, same code-point order |
| Page freezing | Build/Improve/Find cover blocked the page | worker, page keeps painting | `app3/engine.ts`; falls back to in-page if no worker (tested from http and file://) |

## Tests that guard it
- 19 golden fixtures (hand computed from the spec), 5 seeded fuzz suites (about 1,300 random commits): integrity after every commit, undo restores the exact state hash, replaying every change set rebuilds the tables, evaluate is deterministic, Build is idempotent and never touches the past, Repair options apply cleanly and close their gaps and never move pinned or past work, Improve never raises a Fail, open or unverified count, shuffling every input list changes nothing.
- Save layer: codec round trip, append-only log, corrupt and truncated files refused, crash recovery from the browser copy.
- `scripts/v3-perf.ts`, `v3-perf-build.ts`: timings at full size.

## Damaged data (validation pass)
- `checkIntegrity(state, journal?)` validates everything evaluate, search and the views read: every date, weekday 0-6, counts (whole numbers, 0 or more), config numbers, license maps (state keys, expiry null or a date), travel keys and minutes, recurrence (weekdays, cycle, anchor, nth), enums, key = id / key = fields, and every cross reference (stores, pharmacists, overrides to assignments, base stores, unavailability scope). With the journal it also checks change set shape and order, snapshot dates, told keys and checkpoints. Counters below an existing id or sequence are reported. One pass, O(n), pure, never throws on any input shape.
- Each problem is `{table, key, problem}`; `fatal: true` marks unusable data (bad shapes, dates, numbers, dangling references). Non-fatal: duplicate pharmacist/store/date, last before first, Turned-down shape, unknown rule id on an override, counters, change set order.
- Loader (`persist/codec.ts`): any fatal problem refuses the file with a `CodecError("unreadable")` naming the first five. Non-fatal problems keep today's path (opens read-only with the problem list). `salvageBytes` returns null for a world with fatal problems, so nothing that cannot be rendered safely is offered. Row keys such as `__proto__` are stored as plain entries.
- Domain guards: `dateOk` is a non-throwing, cached date check. evaluate ignores a bad `range` or `window`; Build, Reset to Pattern, Improve and Repair return "nothing" for a bad as-of or range date; unknown rule ids and missing rows in the search, Build, Improve, posting and choice lists are skipped instead of asserted. `evaluate` does not throw on any state that has no fatal problem (corruption fuzz).
- Tests: `domain/test/corruption.test.ts` (2,500 seeded one-field corruptions on small worlds and 150 on the practice world: either a fatal problem is reported or evaluate, Build, Improve, Repair, Reset, post, to-tell and choices do not throw), `domain/test/import-integrity.test.ts` (importer output passes the check), `persist/test/hostile.test.ts` (truncation at many lengths, bit flips, wrong version/app, missing and empty tables, junk rows, recomputed hash over damaged data, 5 MB strings, 20,000 junk rows, hostile keys).
- Left open: `persist/core.ts` still opens a world with non-fatal problems read-only and treats `unreadable` as a refusal; it should show `CodecError` text to the user as is.

## Session growth (looked at, not changed)
- Every commit and undo appends a change set to `journal.changeSets` by copying the array (O(n) per commit, O(n^2) over a session) and the saved `change_sets` table is append-only (triggers). Each change set keeps full before/after events.
- Undo here is by change set id (any earlier change set, refused if later ones touch the same keys), not a stack, and checkpoints name a change set id and a state hash. Dropping old change sets would break Undo of those, checkpoint Revert, the replay test (every change set rebuilds the tables) and the append-only file rule; a checkpoint-and-truncate scheme needs a new table and a format version. That changes the save format and the fixtures' meaning, so it is left alone.
- Cheap safe follow-ups when it matters: push into a mutable array owned by the world instead of spreading; measure at 5,000 change sets first. Today a heavy month is a few hundred.

## Findings worth knowing
- Search cost is dominated by how many people could move on the gap dates, not by the size of the month. Chains are capped (3, or 5 when wider) and the node limit is a count, so a worst case ends with "Search limit reached", never a hang.
- Repair refuses anyone whose license or drive time is not recorded ("Cannot evaluate"). That is correct under the rules but means a freshly imported file with blank licenses gets few suggestions until Setup Check items are filled in.
- The posted snapshot stores initials and required counts, not per-cell open counts, so a placed person who does not count hides a gap on a reprint. Small fix: store `open` per cell.

## Still open (ranked)
1. Browser stress run (random clicks and edits through the real UI, then save/reopen and compare) and an accessibility sweep over every view.
2. Real-file trial: run `scripts/v3-compare.ts` on a real month and read the differences.
3. Real native file pickers, Firefox, Safari, Edge, Windows, OneDrive: untested.
4. Two windows open at once: last writer wins (Web Locks would fix).
5. Memoize evaluation across window shifts; measure at 5 years of history.
6. Print: hidden gaps (above), logo, real printer check.
