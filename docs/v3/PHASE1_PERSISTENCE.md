# Phase 1 - Persistence spike (single-file HTML, no server)

Branch `v3/persist-spike`. Code: `spikes/persist/` (README there). Tested: Chromium 141 (Playwright, headless, Linux), page loaded from `file://`.
Raw results: `spikes/persist/results/*.json`. Re-run: `cd spikes/persist && npm i && npm run build && npm test`.

## Results

| # | Test | Result | Key numbers / finding |
|---|------|--------|-----------------------|
| 1a | file://: secure context, IndexedDB, picker functions, WASM, crypto.subtle, CompressionStream | PASS | isSecureContext=true, origin `file://`, IDB works, `showSaveFilePicker` and `showOpenFilePicker` present |
| 1b | file://: OPFS usable | **FAIL** | `navigator.storage.getDirectory` exists but throws SecurityError on file://. OPFS mirror is not possible; IndexedDB is the only browser-side mirror |
| 2a | IDB mirror + stored file handle survive close/reopen (persistent profile, same URL) | PASS | Handle cloned into IDB came back; un-saved edit offered as recovery |
| 2b | HTML moved/renamed/copied to another path, same profile | PASS (data **shared**) | All file:// pages share one origin, so the copy sees the same IDB data and the same linked file. Not lost, but also not isolated |
| 2c | Different profile / browser / PC | PASS (empty) | Nothing carries over; only the user's file does |
| 3a | SIGKILL after 3 acknowledged edits (journal only, no mirror, no file save) | PASS | Reopen: file at rev 2, mirror rev 5, 3 journal entries replayed, row count identical to pre-kill. No lock-file cleanup needed |
| 3b | SIGKILL during an in-flight 5 MB mirror write (0/5/15/40/100 ms) | PASS 5/5 | IDB snapshot never corrupt; no acknowledged edit lost |
| 4 | Site data cleared (CDP `Storage.clearDataForOrigin`) | PASS | App came up empty. Opening the exported file restored all rows, 2002 log rows and the checkpoint. Edits after the last export are lost |
| 5 | Adapter vs in-memory fake `FileSystemFileHandle` (11 cases) | PASS 11/11 | Verified save, failed-write, silent-corruption detection, append-only log, checkpoint/revert/undo-revert, journal recovery, permission re-grant, corrupt/truncated/garbage refusal, unsaved-changes guard, Save As lineage, fallback |
| 6 | Measurements | see below | |
| 7 | createWritable swap semantics (real Chromium, OPFS handle on http://127.0.0.1) | PASS | Target unchanged while writing and after `abort()`; replaced only on `close()`; swap file `*.crswap` exists meanwhile |

Native picker cannot be automated (needs a real OS dialog and user gesture). Browser tests used a handle-shaped stand-in backed by a real disk file; the real `fsaBackend` is a ~10 line wrapper and is the part not exercised.

### Measurements (16 stores, 60 pharmacists, 730 days = 31,307 assignments, 50,005 log rows)
- HTML: 917 KB (417 KB gzipped; WASM 658 KB raw / 857 KB base64). Cold load to first query: 142 ms median of 5 (WASM init 72 ms).
- DB file: 5.4 MB. Export 4 ms, import 4-12 ms, `integrity_check` 20 ms (`quick_check` 14 ms), month query 2 ms.
- IDB snapshot mirror 27 ms; journaled edit (one durable IDB commit, `durability:'strict'`) 2 ms; adapter save excluding disk write 64 ms (export + write + read-back compare).
- Checkpoint 234 ms, 5.33 MB -> 0.82 MB gzip (15%). Revert 0.75 s (includes the automatic before-revert checkpoint).
- Memory: JS heap 167 MB after the workload; whole browser RSS 727 -> 774 MB (all processes, rough). Fine for desktop.
- Not measured: real disk write time (depends on disk/OneDrive/AV), peak memory precisely.

## Recommended design
1. **Truth = the user's file** (`.sqlite`), chosen once with Save As; handle stored in IDB. Save writes `createWritable()` -> swap file -> atomic replace on `close()`, then reads back and byte-compares; failure keeps the old file and the app stays "unsaved".
2. **Mirror = IndexedDB** (not OPFS, blocked on file://): full snapshot (debounced 2 s, max 30 s) + a **journal** of every edit (statement + resolved params, one transaction with its change_log row and a `rev` bump) committed before the UI is told "done". Recovery = file, or snapshot + journal replay if newer (same `db_uuid`, higher `rev`); user chooses.
3. **Change log**: `change_log` table, UPDATE/DELETE blocked by triggers; survives revert (revert appends a row).
4. **Checkpoints**: gzip'd snapshots in a `checkpoints` table in the same file (user-owned) plus the last 10 duplicated in IDB (so a damaged file can still offer one). Revert auto-checkpoints first, so it is undoable. Keep a cap (about 10-20) since each is about 15% of the db.
5. **Open**: `PRAGMA integrity_check` + application_id + user_version. Failure -> refuse, leave current data untouched, offer mirror / checkpoint (from IDB, or salvaged from the damaged file). Restoring detaches from the bad file: the next save must be Save As, never an overwrite.
6. **Save As** creates a new `db_uuid` (so an old file is never mistaken for the mirror's source). Guard: opening another file with unsaved changes asks first.
7. **Durability without WAL**: sql.js is in-memory only (no WAL, no file-level journal, no temp-then-rename; the file is only ever written whole). Guarantees we get instead: (a) in-memory SQLite transactions are atomic; (b) each acknowledged edit is durable in IDB (fsync'd) before return; (c) file writes are all-or-nothing via the FSA swap file; (d) read-back verification. Exposure: edits since the last IDB commit (unacknowledged) and anything if the IDB is cleared before a file save.
8. UI must show "saved to file X at hh:mm" / "N changes only in browser", and prompt to save on close.

## Browser support and what the district manager sees
| Browser | File access | Experience |
|---|---|---|
| Chrome / Edge (Win, Mac, Linux, ChromeOS) | FSA handle (picker functions confirmed in Chromium 141; Edge is the same engine, **not tested separately**) | Save As once, then Save/autosave write her file silently. After a browser restart she may need one "Allow" click (re-request permission). Crash/close: nothing lost beyond the last second |
| Firefox | No `showSaveFilePicker` (per docs; **Firefox not tested here**) | Fallback: Save = download a copy to Downloads (renamed `(1)`, `(2)`...); Open = pick the file. Autosave to IDB only |
| Safari | No `showSaveFilePicker` (per docs; **not tested**) | Same fallback; plus script-writable storage can be evicted after ~7 days of non-use (documented behaviour, unverified) |

**Lost in the fallback**: silent in-place save, remembered file/handle, one-file-one-truth (copies pile up in Downloads), verification of what she kept, and the OS file dialog on every Open. Browser storage still gives crash recovery, but clearing site data erases everything since the last download (test 4). Mitigation: "last downloaded at ..., N changes not in a file" banner, auto-prompt a download on checkpoint and on close.

## Known risks
- **file:// storage is one shared origin** (2b): any local HTML file opened in that profile can read/overwrite our IDB. Namespace keys by app id and validate `db_uuid`; do not store anything secret there. Chrome flags/policies that change file:// behaviour not tested.
- Journal replay must be deterministic: store resolved values, never `date('now')`/`random()` (the demo "Add" button violates this; fine for a spike).
- No multi-tab/multi-window locking (two windows = last writer wins). Web Locks API would fix it; not implemented.
- IDB is not user-owned and can be cleared by the browser/user; the file is the only durable store. `navigator.storage.persisted()` was false.
- Permission prompt after each browser restart; whether recent Chrome offers persistent grant for this case is not verified.
- File in OneDrive/Dropbox/network folder, antivirus locks, and the leftover `.crswap` after a crash: not verified on real disks/OSes (Linux only, OPFS stand-in).
- Corruption tests are synthetic (overwritten page, truncation, garbage), not real bit-rot. The in-file checkpoint salvage worked in the synthetic case only.
- Whole-file rewrite on each Save: fine at 5 MB; a 50 MB db would need re-measuring.

## What I could not verify
Real native pickers (open/save dialogs, user gesture, permission prompt); Firefox, Safari, Edge, Windows, macOS; real FSA atomic replace on a real filesystem (verified only on OPFS handles over http, and on a fake); persistent-permission behaviour across restarts; cloud-synced folders; storage eviction; headless vs headed differences; peak memory beyond rough RSS.

## The ONE question for the owner
**"Which browser and which computer (Windows/Mac/Chromebook) do you use to open files, and do you keep them in OneDrive/Dropbox?"**
- Chrome or Edge on Windows/Mac/ChromeOS: build exactly the above (FSA is primary, download is the safety net).
- Firefox: fallback-first design: Save = download with a visible "unsaved to file" banner, auto-download of checkpoints, and a clear Open flow; or ask her to install/use Edge (preinstalled on Windows), which restores the primary design.
- Safari (Mac): fallback plus the 7-day eviction warning and a mandatory periodic download; strongly prefer asking her to use Chrome.
- OneDrive/Dropbox folder: add a "save to a local folder, then copy" note and test real saves there before committing to the swap-file approach.
