# Persistence spike (Phase 1)

Self-contained proof of: sql.js (SQLite/WASM, inlined) in memory -> user-owned file via File System Access API,
IndexedDB mirror + journal for crash recovery, change log, checkpoints, revert, Save As, download/upload fallback.
Design and results: `docs/v3/PHASE1_PERSISTENCE.md`. Nothing here touches `src/`, `e2e/` or root `package.json`.

## Run
```
cd spikes/persist
npm install          # sql.js, esbuild, playwright-core (own package.json; node_modules is git-ignored)
npm run build        # -> dist/persist-spike.html (single file, ~917 KB, no network at runtime)
npm test             # unit-fake.mjs (adapter vs fake file handle) + run-tests.mjs (real Chromium, file://)
```
Browser tests need a Chromium at `/opt/pw-browsers/chromium-*/chrome-linux/chrome` (no download is attempted).
Results are written to `results/unit-fake.json` and `results/browser.json`.
To try it by hand: double-click `dist/persist-spike.html` in Chrome/Edge (buttons: New, Open, Save, Save As, Add, Checkpoint, Revert);
append `#fallback` to the URL to force the Firefox/Safari download path.

## Files
- `adapter.js` - the whole persistence layer, DOM-free, dependencies injected. Surface: `resume open save saveAs mirror checkpoint revert` (+ `run`, `status`, `download`, recovery/restore helpers). `fsaBackend` is the thin real wrapper over `showOpenFilePicker/showSaveFilePicker`; `downloadBackend` is the fallback.
- `seed.js` - realistic dataset (16 stores, 60 pharmacists, 730 days, 50k log rows).
- `app.js`, `template.html`, `build.mjs` - demo UI and the single-file build.
- `unit-fake.mjs` - test 5 (in-memory fake `FileSystemFileHandle`, fault injection, corruption).
- `run-tests.mjs` - browser tests 1-4, 6, 7 (SIGKILL, persistent profiles, CDP clear).

## Test-harness caveat
The native picker cannot be automated. In the browser tests the "user file" is a handle-shaped object (`getFile/createWritable/queryPermission`)
backed by a real file outside the profile (written temp-then-rename by Node). OPFS is blocked on `file://`, so it could not stand in.
