# v3 strategy

Goal: evolve the month prototype into a date-based, headless-domain scheduler with a durable single-file save, without touching prototype behavior until Phase 5. A human decides every shift. Nothing auto-schedules.

## Principles
1. **Prototype stays green.** `main` is untouched. All work is on `v3/*` branches. `npm run check` (prototype) and `npm run check:v3` (domain) must both pass before any merge.
2. **Spec before code, fixtures before logic.** Phase 2 writes the rules as prose plus JSON golden fixtures. Phase 3 makes the fixtures pass. A rule with no fixture is not a rule yet.
3. **Pure domain.** `domain/` has its own tsconfig with no DOM lib and no `Date`, no clock, no locale. As-of date is an argument. Ordering is code-point (`cmp`). IDs are stable strings.
4. **One legality function.** Rules, choices, cover plans and Repair all call the same `rules.ts` / `coverage.ts`. The prototype has three copies; v3 has one.
5. **Small steps, one owner per file.** Parallel agents only on disjoint files after the types contract is committed.

## Token-efficiency
- Agents get a file list, the spec section, and the fixtures that must pass. They do not re-read the repo.
- Tests are the contract: an agent's report is "N/N fixtures, typecheck clean", not prose.
- Heavy reading (prototype rules) happens once, into `DOMAIN_SPEC.md`. Later phases cite the spec.
- Reports to the owner are under 200 words with a link to the doc.

## Branches
| Branch | Purpose |
|---|---|
| `v3/foundation` | strategy, decisions, domain scaffold, spec (this branch) |
| `v3/persist-spike` | Phase 1 spike (agent worktree) |
| `v3/domain` | Phase 3 headless domain, off foundation |
| `v3/import` | Phase 4 importer |
| `v3/ui` | Phase 5 wall UI |

## Phases and gates
| Phase | Output | Gate |
|---|---|---|
| 0 | Read and report | done |
| 1 | `docs/v3/PHASE1_PERSISTENCE.md` + spike | owner picks save strategy |
| 2 | `DOMAIN_SPEC.md`, `domain/fixtures/*.json`, fixture runner | owner reads spec |
| 3 | `domain/src/*` passing all fixtures | check + check:v3 green |
| 4 | `import-v2.ts` + old-vs-new comparison report | zero unexplained diffs |
| 5 | Wall UI per section 27, month grid retired | e2e + owner walk-through |

## Defaults standing in for unanswered owner questions
See `DECISIONS.md`. All reversible; each is isolated behind one function or one rule row.

## Risks
- `file://` storage behaviour differs by browser: Phase 1 decides durability, not assumption.
- Fixtures can encode a wrong reading of a rule. Mitigation: owner reviews the spec's worked examples, not the code.
- Phase 5 is the largest surface. Keep the prototype UI shipping until the wall passes the same e2e checks.
