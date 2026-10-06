# Domain spec (v3)

Source of truth for Phase 3 code and Phase 2 fixtures. Binding rulings come from the owner's brief; where the brief was silent or ambiguous I picked a reading and numbered it **I-n** (section 15). Change an I-n by editing it here and its fixtures.

Types live in `domain/src/types.ts` and `domain/src/api-types.ts`. This doc says what they mean.

## 1. Model

- Tables are `Record<key, row>`. A **key** is `table:rowKey` (e.g. `assignment:A7`, `cell:S1|2026-05-04`). Change sets diff by key.
- IDs are per entity type, monotonic, never reused (`nextId` counters; counters are not part of any change set and never rewind on undo). Initials and codes are editable labels, never identity.
- Dates are `YYYY-MM-DD`. Time is integer minutes. Ordering is code-point (`cmp`). The as-of date is an argument everywhere; the domain never reads a clock.
- **Past** = date < asOf. Past assignments are never changed by the engine.
- One assignment = one pharmacist, one store, one date. Unslotted. Fields: `placedSeq`, `source`, `agreed`, `pinned`, `partialNote`, `dontRestore`. Pattern-source assignments are Agreed.
- Requirement for (store, date): the date override count if one exists (0 = closed), else the weekly requirement with the latest `effectiveFrom` <= date for that weekday, else 0. A store with `inactiveFrom <= date` or `activeFrom > date` has requirement 0 whatever the tables say.

## 2. Rules registry

One declarative list in `domain/src/rules.ts`. Attributes: `id`, `kind` (presence|policy), `severity` (serious for presence, warning for policy), `overridable`, `reasonRequired`, `suggestible`, `message`, `fix`. Verdicts: `Pass | Fail | Unknown | NotApplicable`. Logic stays in code; thresholds (90/150, max consecutive, Improve limits) are `Config`.

| id | kind | Fails when | Signature | overridable | reasonRequired | suggestible |
|---|---|---|---|---|---|---|
| `closure` | presence | requirement(store,date) = 0 | `closed` | yes | yes | no |
| `licensing` | presence | pharmacist not licensed in the store's state on that date; Unknown if licensing not recorded | `P|state|none\|expired\|unrecorded` | **no** (I-1) | yes | no |
| `availability` | presence | pharmacist inactive on date, or an Approved/Actual unavailability covers the date and its scope is empty or equals the store (Requested counts too only with `includeRequested`; Denied never) | sorted record ids, or `inactive` (+ ids) | yes | yes | no |
| `double-booking` | presence | pharmacist has more than one assignment on the date (see 4) | sorted store ids of the group | yes | yes | no |
| `travel-soft` | policy | minutes(base→store) > `travelSoftMinutes` (90); Unknown if the pair is missing; NotApplicable if no base store; 0 if same store | `minutes` | yes | no | yes |
| `travel-hard` | policy | minutes > `travelHardMinutes` (150); same Unknown rule | `minutes` | yes | no | yes |
| `consecutive-days` | policy | assignment is on day number > `maxConsecutiveDays` of an unbroken run of dates with an assignment for that pharmacist | `runLength` | yes | no | yes |

`rest` (mentioned in the brief) is undefined; no rule until the owner says what it is (I-2).

Pins are not rules. A pinned assignment that violates a rule is an ordinary Fail; its UI step is "Unpin and repair".

## 3. Coverage (one function: `evaluate`)

1. For each assignment compute every rule result.
2. `counts` = no presence rule has an **unresolved Fail**. Unresolved = Fail with no matching override whose `signature` equals the current one. An override whose signature differs is **outdated**: flagged, and it does not restore the count (I-3).
3. `unverified` = counts, and some presence rule is Unknown. Unknown counts but is flagged.
4. Policy rules never affect counting.
5. Per (store,date) cell: `counted` = counting assignments; `covered = counted + locum`; `open = max(0, required - covered - acceptedShort)`; `surplus = max(0, covered - required)`. `locum` and `acceptedShort` are counts from `CellCount`, not slots. A closed store has required 0, so any assignment there fails `closure` and counts toward nothing.
6. `evaluate(state, asOf, {includeRequested, range})`. Build and Repair use Approved+Actual only. Plan and What-If pass `includeRequested`.

Assignments with a partial-day note are whole days to the engine. The engine never moves them and never counts them as surplus.

## 4. Double booking and overrides

- Group = assignments of one pharmacist on one date, size > 1. With **no** override each member Fails and none counts.
- If every member except the earliest `placedSeq` has an override on `double-booking`, the group is **resolved**: all members count. A single override on a member of an unresolved group restores nothing.
- Removing an override or moving a member re-evaluates at once. An override whose rule would now Pass or NotApplicable is **moot** and is removed in the same change set that made it moot (event `override.remove`).
- An override belongs to one assignment + one rule. It stores the violation signature. The engine never creates one. The engine may only *suggest* overrides on suggestible rules (`travel-soft`, `travel-hard`, `consecutive-days`); never licensing, availability, closure, double-booking, or pinned items.
- `commit` refuses an override on a non-overridable rule, and requires a non-empty `reason` where `reasonRequired`.

## 5. Change sets, History, Undo, Checkpoints

- A change set is atomic: typed events `{type, key, before, after}`, one History line, one Undo unit. Manual label: `Placed by you.` Engine change sets (build, repair, improve, reset) also store `explanation[]`, `engineVersion`, `ruleHashes` (per effective-date segment, content-addressed SHA-256 of the rule's code-version string plus its config), and `stateHash`.
- `commit` validates edits (unknown ids, unavailable scope shape, duplicate place) and refuses a whole change set rather than applying part. It also writes the To-tell ledger when an assignment becomes Agreed (section 7).
- **Undo** writes a new change set of kind `undo` with `reverses`. It is allowed only if for every key the original touched, the current value equals the original `after`. Otherwise refuse with `reason` and `laterChangeSets` = the later change set ids that touched any of those keys, ascending.
- **Checkpoint**: `{name, afterChangeSet, stateHash}`. **Revert to Checkpoint** is itself a change set (kind `revert`): the diff from current state to the state at the checkpoint, reconstructed by replaying the log. It is refused when a proposal or scenario is open.
- Every committed change set increments `nextId.changeSet` and `seq`.

## 6. Proposals and scenarios

- At most one proposal and one scenario at a time. While a proposal or an **unparked** scenario is open, the live schedule is read-only: `commit` refuses.
- A proposal stores the `stateHash` the engine saw. `acceptProposal` recomputes the hash; if it differs, refuse ("The schedule changed since this was proposed") and discard.
- The state hash covers canonical serialization of the `DomainState` tables only: keys sorted by code point, no History, To-tell, snapshots, session or UI state. SHA-256 implemented in pure TS.
- Scenario: `openScenario(name)` records `baseHash`; `scenarioEdit` applies edits to a virtual copy. `parkScenario` makes the live schedule editable again (`parked = true`). Any change set committed while parked sets `stale = true`; posting does not. A stale scenario is read-only: export or discard only. `openScenario` is refused while any scenario exists (I-4).

## 7. Posting and To-tell

- `post(range, asOf)` makes an immutable `PostingSnapshot` with `revision` (1, 2, 3 …). It stores per cell the sorted initials and the requirement, so reprints reproduce. The live schedule stays editable. Open requirements, violations and overrides at posting are **warnings only**, returned as counts on the snapshot (I-5: confirm, never block).
- **To-tell ledger** `journal.told[pharmacistId|date]` = last-communicated value: a store id or `off`.
  - `agreed` becoming true on an assignment (place with agreed, update, or Pattern instantiate) writes told = its store in the same change set. Agreed implies told.
  - `toTell(world)` lists every pharmacist-date where `was` (ledger, default `off`) differs from `now` (the live store, or `off`). Dates before asOf are excluded.
  - Entries are net: A→B→C shows `A→C` once; if the live state returns to the ledger value the entry vanishes.
  - `markTold(entries)` sets ledger = current for those entries. The ledger persists across revisions.
- `changedSincePosting` compares live to the **latest** snapshot per pharmacist-date.

## 8. Standing assignments

- `store + pharmacist + recurrence + effectiveFrom/To`. Recurrence: `weekdays`, `cycleWeeks` 1–4 anchored to `anchor` (week index = floor((dayNumber(date) − dayNumber(Sunday of anchor's week)) / 7); matches when index mod cycleWeeks = 0 using floored mod), and optional `nth` (1–5, the weekday's occurrence within its month). All conditions AND together; use several rows for rotations that differ by week.
- Pattern edits never touch the live schedule. Identical duplicates (same store, pharmacist, recurrence, dates) merge on add.
- A pattern that puts one pharmacist at two stores on the same date is a pattern conflict: Setup warns; Build instantiates neither side and reports `Pattern conflict`. Order never decides.

## 9. Build

`build(world, {from,to}, asOf)` returns a proposal (or none) and a report. It never changes dates before asOf.

Build marks dates `built` through `Proposal.builtDates`, applied on accept; they are bookkeeping, not edits.

1. For each date in range not in `built`: instantiate pattern assignments (source `pattern`, `agreed` true) where legal. A pattern assignment that would fail a presence rule is **not** created (counts under `patternCannotApply`; if it leaves the cell short, under `exceptionsCreatedGaps` once the cell is short). Pattern conflicts are skipped and listed. Mark the date `built`.
2. Keep every legal existing assignment. Differences from the pattern are exceptions, not errors.
3. Remove illegal assignments of source pattern/build/repair/improve that are not pinned or partial-noted (listed as `conflictsRemoved`); manual, emergency, pinned and noted ones are left and listed as `conflictsLeft`.
3b. Fill gaps with the same joint search as Repair, **default scope, no off-duty pharmacists** (Build never adds extra shifts; Repair with Search Wider does), source `build`, repeated until a full pass makes no progress.
4. **Idempotence**: with unchanged inputs a second Build returns `proposal: null` and `edits: 0`. Unresolvable gaps stay in `unresolvedGaps`; they are not retried into a different answer.
5. `resetToPattern(range, storeIds|null)` is separate and explicit. It skips pinned, past, `dontRestore`, partial-noted assignments, and any restore that would violate a rule.

## 10. Repair

`repair(world, gaps, opts, asOf)`.

- Gaps: up to 5 selected cells; more are taken in date order (then store) and `gapsDropped` says so. Search is joint over the used gaps.
- Moves are limited to the **gap dates**. Never other dates, pinned, past, or partial-noted assignments.
- Default scope: chains up to 3 moves, up to 4 pharmacist-dates changed. **Search Wider**: chains up to 5, up to 8 changed, and off-duty pharmacists (no assignment that date, available, legal) marked "will take extra shifts".
- Candidates that would carry an Unknown verdict are never proposed; those caused by an unknown travel pair go to `excludedUnknownTravel`.
- Max 3 options, ordered lexicographically by: violations introduced, open requirements remaining, overrides needed, distinct pharmacist-dates changed, pattern exceptions created minus restored, total travel minutes, then `(pharmacistId, storeId, date)` code-point order of the edits. Fairness is not a term (I-6).
- **Clean** = 0 violations introduced and 0 open requirements remaining in the used gaps and in any cell the option vacates. A new Fail on a suggestible policy rule (travel, consecutive days) is not a violation; it is counted as an override needed, shown on the option, and never created by the engine. `options` holds clean options only; the best non-clean candidate is `nearMiss`. Statuses and exact messages:
  - `options`: one or more clean options.
  - `none`: "No solution within scope; search complete" (the best non-clean candidate is returned as `nearMiss` only when `opts.showNearMiss`).
  - `limit`: "Search limit reached; a solution may exist" when `searchNodeLimit` evaluated candidates is hit first.
  - `cannot-evaluate`: "Cannot evaluate: <missing data>" when data needed to judge every candidate is missing.
- The candidate pool is never truncated before ranking; only the final list is cut to 3.
- Determinism: exhaustive depth-first search in a fixed order (pharmacist id, store id, date, all by `cmp`). Node limit is a count.

## 11. Improve

Only on explicit trigger. A change is **meaningful** if the result removes a violation or an override, or restores 3+ standing assignments, or saves 60+ total travel minutes (config). At most 10 changed assignments. The final state must be legal; for every rule the Fail count and the override count may not rise; open and unverified counts may not rise. Excluded: Unconfirmed, emergency-source, pinned, partial-noted, past, and the next 14 days (unless `includeNext14`). If nothing qualifies, say so in plain words: "Nothing to improve." Returns a proposal; nothing is applied.

## 12. Travel

Pair data is minutes and miles from the pharmacist's **base** store to the assigned store; directed key `from|to`; same store = 0 minutes. Limits and tie-breaks use minutes. Mileage pay uses miles and the effective-dated rate in `config.mileageRates`. A missing pair is Unknown, never zero. No straight-line estimates anywhere in the domain.

## 13. Data integrity

- Results are Pass/Fail/Unknown/NotApplicable. The engine never proposes an Unknown.
- Setup rows use `effectiveFrom` (the first inactive day is the effective date).
- `Unavailability`: Turned-down needs `scopeStoreId` and `first === last`; every other type must not have a scope. `commit` refuses violations.
- Integrity check failure at load: refuse to open, offer a checkpoint. Inconsistent domain data (dangling store/pharmacist/assignment id, duplicate key, bad scope shape): open read-only with an exportable diagnostic bundle. No automatic repair in v1. (`checkIntegrity(state)` returns the list; wired in Phase 4.)

## 14. Mandatory scenarios → fixture files

| # | Scenario | File |
|---|---|---|
| 1 | Pattern expansion across a month boundary (4-week rotation + 1st/3rd Saturday) | `pattern-month-boundary.json` |
| 2 | Build idempotence | `build-idempotence.json` |
| 3 | Approved vacation at a single-pharmacist store | `vacation-single-store.json` |
| 4 | Multi-day sick call with Undo | `sick-multiday-undo.json` |
| 5 | Two call-outs where joint search beats greedy | `repair-joint-vs-greedy.json` |
| 6 | 3-step closed chain | `repair-chain-3.json` |
| 7 | No clean solution → nearest miss | `repair-nearest-miss.json` |
| 8 | Unknown travel | `travel-unknown.json` |
| 9 | Pin versus new absence | `pin-vs-absence.json` |
| 10 | Surplus and partial-day note | `surplus-partial.json` |
| 11 | Override lifecycle (add, outdated, moot, remove) | `override-lifecycle.json` |
| 12 | Double booking via override | `double-booking-override.json` |
| 13 | Turned-down coverage scoped to a store | `turned-down-scope.json` |
| 14 | Post, change A→B→C, tell, restore | `post-tell.json` |
| 15 | Scenario park and stale | `scenario-park-stale.json` |
| 16 | Improve thresholds and exclusions | `improve-thresholds.json` |
| 17 | Store closure with assignments | `store-closure.json` |
| 18 | Shuffled input order → identical output | `shuffle-identical.json` (and `"shuffle": N` on others) |
| + | Prototype conversions (fill-cases, closed-chains) | `proto-*.json` where semantics are unchanged |

## 15. Interpretations and deviations

- **I-1** Licensing is `overridable: false` (the brief says every rule is overridable). Prototype behavior and owner default D2. One flag flips it.
- **I-2** `rest` is undefined in the brief; no rule yet.
- **I-3** An outdated override does not restore the count.
- **I-4** One scenario at a time includes a parked one.
- **I-5** Posting never blocks.
- **I-6** Fairness is not part of Repair ordering; it may appear later as a last tiebreak only.
- **I-7** The 90 and 150 minute travel limits are two policy rules (`travel-soft`, `travel-hard`), both configurable, both suggestible.
- **I-8** Build keeps a `built` date table so a gap the DM leaves on a built date is a gap, not a pattern re-instantiation.
- **I-10** Rule hashes in v1 have a single effective-date segment: config is not effective-dated, only mileage rates are.
- **I-11** Reset to Pattern restores a pattern assignment by moving the pharmacist's other assignment that date (or placing one if none); it never removes anyone else, so a cover person left behind shows as surplus for Improve.
- **I-12** Improve re-deals pharmacists among existing slots on one date (swap cycles up to the max); it never places off-duty pharmacists. A cycle too long to finish may close early with the last pharmacist taking the first slot; the result must still be meaningful and legal.
- **I-13** State hash excludes `nextId` counters so Undo and Revert reproduce it.
- **I-14** Edits `move` and `swap` clear `agreed` (new placement is Unconfirmed) and drop the partial-day note; `place` is Unconfirmed unless source is pattern.
- **I-9** Same-id ordering is code-point on the id string ("S10" sorts before "S2"); IDs are opaque.

## 16. Fixture format

`domain/fixtures/*.json`: `{ name, covers[], asOf, seed, steps[], shuffle? }`. `seed` is the compact format in `domain/src/seed.ts`. Steps and `expect` (partial deep match; arrays exact; `{"$count":n}`, `{"$has":x}`, `{"$absent":true}`, `{"$any":true}`) are implemented by `domain/test/fixtures.test.ts`; read its `switch` for the exact outputs of each op. Assignments may be referenced as `"store|pharmacist|date"` wherever an `assignmentId` is expected. Fixtures need hand-computed expectations, with a one-line comment field `"why"` on non-obvious steps. A fixture that hits `NotImplementedError` is reported todo until Phase 3 lands.
