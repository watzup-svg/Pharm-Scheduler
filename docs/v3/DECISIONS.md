# Decisions (reversible defaults)

Status: **default** = chosen by me because the owner has not answered; change by editing one row and its fixtures.

| # | Question | Default | Why | Cost to flip |
|---|---|---|---|---|
| D1 | Time off: dates or ranges | Separate dates, stored per date | Matches shipped behavior; a date drops when home is closed | Importer + one record type |
| D2 | Licensing override | Not overridable; hard problem | Legal, not preference | One rule flag |
| D3 | Posting with open problems | Confirm with a list, do not block | DM must be able to post a known-short week | One gate |
| D4 | Desktop only | Yes. No touch, no long-press, no mobile layout | Section 27 | Phase 5 only |
| D5 | Save format | SQLite file is the save; typed in-memory domain is the model | Domain stays pure and testable | Phase 1 decides |
| D6 | Travel unknown | Unknown flag, never zero; no straight-line estimate | Brief | Travel module |
| D7 | Fairness | Last tiebreak only, never overrides a hard rule | Brief | Ordering list |
| D8 | Improve and scenarios | Deferred past Phase 5 | Cuts scope | Add later |
| D9 | Auto-assign | None. `placeName` equivalent is the only commit gate | Non-negotiable | n/a |
| D10 | Browser / OS of the DM | Assume current Chromium on Windows; keep a download/upload fallback | Unknown | Phase 1 report |

## Brief items rejected or reshaped
- SQLite as the in-memory model: rejected (adds WASM to every test). Save format only.
- Away-count term in cost: dropped from the Repair order, which is lexicographic.
- Straight-line drive estimates: removed.
