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
