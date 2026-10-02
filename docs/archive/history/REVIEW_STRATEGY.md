# Review strategy (full pass)

Principle: attack the app from the side of each person who can be hurt by it, and from the side of each thing that can break. Every check is either automated (repeatable, goes in `e2e/` or the unit tests) or a named manual judgement. Findings get a severity, a fix if safe, and a regression check.

| # | Lens | Question | Method | Pass bar |
|---|------|----------|--------|----------|
| 1 | Health | Is the baseline green? | typecheck (strict + unused), unit tests, build, browser suite | all green |
| 2 | Logic | Can rules or suggestions ever be wrong? | randomized invariants: placement, undo/redo, licenses, time off, accept keys, drive overrides, file round-trip | zero violations over thousands of ops |
| 3 | Data | Can a file hurt it? | hostile and malformed files, oversize, prototype keys, old versions | rejected or loaded safely, no crash, no pollution |
| 4 | Security and privacy | Does it leak or execute anything? | HTML/script in every free-text field, network log, stored data inventory | no script runs, no outside requests |
| 5 | Layout | Does it break at any size or setting? | every page x 4 widths x (normal, large text, high contrast): page overflow, clipped/offscreen controls | none |
| 6 | Accessibility | Can everyone use it? | axe on every page and every dialog open; keyboard walk with focus-visibility check; touch target size | no violations, every stop shows focus |
| 7 | Consistency | Does it follow its own rules? | one filled red per screen; 13px minimum text; wording and punctuation scan | rules hold |
| 8 | Print | Does paper match screen? | stress PDFs on every paper and option, text-bounds check | no text off page |
| 9 | Scale | Does it stay fast and correct when big? | 80 stores / 120 people: load, interaction timing, pack size | under 1 s interactions |
| 10 | Robustness | What do real users do that scripts don't? | random click/type stress on every page at two widths | no script errors |

## Results of this run (2026-09-30)
| # | Lens | Result |
|---|------|--------|
| 1 | Health | Green: strict types with unused checks, 239 tests, build, browser suite. |
| 2 | Logic | 8,000 random placements on demo and sample months: no unlicensed placement, refused writes never change the doc, counters agree, accepts prune correctly, suggestions always license-ok, file round trip keeps the evaluation. |
| 3 | Data | 10 hostile or malformed files (empty, non-JSON, prototype keys, deep nesting, huge numbers, 2 MB strings, bad drive times): rejected or cleaned, no crash, no prototype pollution. |
| 4 | Security | HTML and script in person, store, holiday, note, address and file names: shown as plain text, nothing ran, no outside network request; only local storage keys. |
| 5 | Layout | 8 pages x 5 widths x 3 display modes. Fixed: header pushed Save/File off screen at 1024 px and with Larger text; People/Stores/Holidays tables made the page scroll sideways at 768 px (hidden "Actions" text escaped its scroll box); Time off tabs overflowed at 320 px with Larger text. |
| 6 | Accessibility | axe on every page and on the day panel, sick, fill, time-off, person, store and holiday forms, File menu and search at 2 widths. Fixed: File menu hid the page from assistive tech while open; search results had buttons inside options; File status text had a wrong role; status tags had 4.0:1 contrast; two 36 px targets. Remaining: axe `region` best-practice on the File menu's portal wrapper (accepted). Keyboard walk: every stop on every page shows a focus ring. |
| 7 | Consistency | One filled red per screen (only the style-guide demo page has more, on purpose). Curly apostrophes fixed in 9 visible strings. Dense-grid micro labels raised from 9-11 px to 12 px. |
| 8 | Print | 7 stress layouts (letter, tabloid, punch, small, two-up, grayscale, draft) and a 201-page pack at 80 stores / 120 people: no text off the page; the big pack builds in 0.5 s, 3.7 MB. |
| 9 | Scale | 80 stores / 120 people: District 1.0 s, Schedule 0.7 s, day panel 0.24 s, Week 0.45 s, other pages under 0.7 s. |
| 10 | Robustness | Random click/type stress on 14 page-and-width combinations: no script errors. |

False positive noted: the layout scanner flags the store-name tag spans in the phone store cards at 320 px; their parent clips them with an ellipsis.
