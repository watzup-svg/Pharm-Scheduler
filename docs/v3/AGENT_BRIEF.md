# Brief for UI agents (v3 app, `app3/`)

## What this is
Hi-School Pharmacy scheduler, v3. One district manager (DM) schedules pharmacists for about 16-18 stores in Oregon and Washington. Single user, desktop only, offline, one self-contained HTML file (`npm run build:v3` -> `dist-v3/v3.html`). **A human decides every shift. Nothing places a name unless the DM accepted it.** The domain (`domain/`, pure TS, 39 tests, 19 golden fixtures) is built and is the only thing that decides legality. You build part of the UI.

## Setup in your worktree (do this first)
1. `git log -1 --oneline` must show `v3 app skeleton` or later. If not: `git reset --hard v3/foundation` (you have no work yet).
2. `ln -s /home/user/pharm-scheduler/node_modules node_modules` (do not run npm install).
3. Check: `npm run typecheck:v3 && npm run build:v3`.

## Read first (skim; do not re-derive)
- `docs/v3/DOMAIN_SPEC.md` (sections 1-7 matter most), `docs/v3/UI_REVIEW.md`
- `app3/store.ts` (the store and every action), `app3/derive.ts` (CellView, issues, ghosts, evaluation hooks), `app3/ui/primitives.tsx`, `app3/persist-types.ts`
- `domain/src/index.ts` (public API: `api`, `choicesFor`, `RULES`, `evaluate`, types) and `domain/src/api-types.ts` (Edit shapes)
- Look and feel: `app3/styles.css` theme tokens (warm paper, ink buttons, green = available/ok only, brick = illegal, amber = warning) and `src/components/marks.tsx` (prototype's mark language). Look at the prototype if useful, but do not import from `src/`.

## Rules
- Edit only files you own (listed in your task). **Do not edit** `store.ts`, `derive.ts`, `App.tsx`, `primitives.tsx`, `main.tsx`, `boot.ts`, `domain/`. If you need a store action or helper that does not exist, write it in your own file (use `useApp.getState()` and `api`), and list it in your final reply.
- All writes go through store actions (`commit`, `runRepair`, `acceptProposal`, ...). Never mutate the world. Never import the prototype (`src/`). Domain only through `@domain`.
- Clock: only `app3/clock.ts`. No `new Date()` elsewhere; use `asOf` from the store.
- Desktop only (1366x768 and up; the shell is min 1280 wide): no touch handlers, no long-press, no mobile layout.
- Hover notes are back (owner decision): format "Title | line | line" in a `data-tip` (or `title`) attribute; the old scheduler's behavior is in `app3/ui/notes.tsx` (tiny marker on hover, note opens on right click / Shift+F10). A note is never the only place a fact appears: the same text must also be in the Inspector, queue or legend. Dialogs only where a decision needs one, with plain buttons.
- Colour is state only and never alone: pair it with a glyph or word (`GLYPH` in primitives). Dense, calm, readable at 13px minimum.
- Keyboard operable, labelled controls, visible focus. Plain warm copy ("Needs 1 more", "Not licensed in WA"), neutral labels, no jargon, no exclamation marks.
- Names: full name when it fits, otherwise first initial + last name ("M. Quenby"), ellipsis last.
- Section 27 style (owner's guide): schedule wall dominant; contextual left panel; docked Inspector; "Someone's Out" above the Inspector; Proposal Bar at the bottom with ghost previews; direct manipulation with explicit commit; dense and calm; no extra dashboards.
- Do not add npm dependencies unless essential (jsPDF, zustand, react, sonner, radix-dialog exist).

## Testing
- `npm run typecheck:v3`, `npm run build:v3`.
- Browser checks use `e2e/v3-lib.mjs` (`launch`, `serveV3`, `openApp(browser, base)` loads the practice month; `check(name, ok)`, `failed()`). Write `e2e/v3-<area>.mjs` that prints `ok`/`FAIL` lines and exits non-zero on failure. Look at a screenshot at 1366x800 yourself (Read the PNG) and fix what looks wrong before you finish.
- `window.__v3.app` is the store (for test setup only). Do not run `npm run check` (slow, prototype only).

## Finish
Commit on your worktree branch (message prefix `v3 ui:`). Do not push. Final reply under 200 words: files written, what works, what you could not do or verify, and any store/derive additions you wanted.
