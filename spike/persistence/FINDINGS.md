# Phase 1: persistence spike, findings

Decision: **plain JSON log, no SQLite.** Every number below was measured in this spike; what could not be measured here is listed at the end.

## Design that was built (`src/domain/`)
- Domain state is plain in-memory tables. Every edit is a change set appended to a log. Nothing else is stored.
- The saved file *is* the log: one canonical-JSON record per line, `<hash>\t<json>`, each hash chained to the one before (SHA-256, written in plain TypeScript so Node and the browser agree). A header line carries the format, version and a database id.
- A checkpoint is a record naming a change-set number and the state hash at that point. **Revert to checkpoint** replays the log to that point, diffs it against now, and commits the difference as a new change set (visible in History, itself revertible). Save As is a copy of the same text.
- After every change set the new line is also written to an IndexedDB copy (strict durability, one database per schedule id). Opening compares file and browser copy by hash chain: file only → file; browser copy extends the file → recover unsaved changes; each has changes the other lacks → opens the file and keeps the other for export (never merged silently).
- Saving re-reads the file first; if it is not what we last read or wrote (second machine, sync client) it refuses with a conflict instead of overwriting.
- Damage handling: a cut-off tail opens to the last whole record; a bad record with more after it is "corrupt" and opens read-only up to the last good record; a valid chain whose content contradicts itself ("inconsistent": log gap, checkpoint hash mismatch) also opens read-only. No automatic repair.
- `src/domain` has a guard test: no `Date`, clock, timers, randomness, locale sorting, framework or browser use. The db id and stamps are passed in.

## What the tests show
| Check | Result |
|---|---|
| Unit tests (hash vs node:crypto, canonical JSON, log, session) | 28 pass |
| File cut at **every** byte offset of a 12-edit log | always opens to the last whole record, never throws, never invents data |
| 120 x `kill -9` of a process saving a 2,000-row database every 3 edits (atomic temp-file + rename sink) | file whole every time, holds every acknowledged save; the browser-copy stand-in holds every acknowledged edit |
| 60 x `kill -9` with a non-atomic in-place sink | no tear landed in these kills (windows are tiny), and every acknowledged edit still recovered from the copy |
| Reader polling the file while another process saves, atomic sink | 0 partial reads of 575 |
| Same, in-place sink | 10,142 of 12,057 reads saw a partial file. This is why the file is never written in place. |
| Second machine replaces the file between our saves | our save is refused, their file untouched, our change still pending, Save As keeps ours |
| Chromium, double-clicked `file://` page: reload | every change recovered from the browser copy |
| Same, then clear **all** site data, then open the downloaded copy | identical state hash, checkpoint intact |
| `kill -9` of the whole Chromium mid-edit, 5 rounds | every acknowledged change set recovered, none invented |
| `FileSystemFileHandle` sink (the browser's private file area on http://localhost, same API as the Chrome picker): save, outside edit refused, torn tail | pass |

## JSON log vs SQLite (sql.js, inlined)
Same synthetic district: 17,000 assignment rows plus 200 edits.

| | JSON log (built) | SQLite via sql.js |
|---|---|---|
| Added to the HTML | about 20 KB (this whole spike page) | about 0.9 MB (45 KB JS + 658 KB WASM as base64) |
| File size | 2.4 MB (all rows and history as text) | 0.75 MB (rows only, no history) |
| Open | 0.4 s, which includes verifying the whole chain | 8 ms including `integrity_check` |
| Durable after each edit | 1.2 ms median, 2.1 ms p95 (append one line) | needs a log of our own anyway; whole-database export per edit is 0.9 ms in memory, but writing 750 KB per edit to the browser copy was not measured |
| Torn write | detected, opens to the last whole record | integrity_check says damaged; no partial open |
| Audit / History / Undo / Revert | the file is the history | we would still build the change-set log on top |
| Readable and diffable | yes | no |
| Needed by the domain | no: search and rules are TypeScript over in-memory tables | no |

SQLite wins on open speed and size. Neither matters at this scale, and the log gives torn-tail recovery and history for free. If a query engine is ever wanted, sql.js can be added later as a cache without changing the file format.

## Known costs of this choice
- The log only grows. Rough estimate: a year of normal use is about 10 to 15 MB (a guess from 750 bytes per change set and 50 per day). If that proves wrong, Phase 3 adds "compact": write a new file with a snapshot and keep the old one beside it as an archive.
- Open verifies every hash: 0.4 s at 2.4 MB, about 4 s at 25 MB. Fine now; a trailing checkpoint-hash shortcut is possible.
- The first open after Chrome restarts needs one click to re-allow the file (Chrome's rule), and the picker handle is remembered in IndexedDB.

## Not verified here
- The real Chrome/Edge file picker (needs a human): the sink was exercised through a `FileSystemFileHandle` from the private file area, which has the same `createWritable` behavior, but the picker flow and the permission re-prompt were not.
- Google Drive for desktop. The synced-folder tests simulate a second writer and a polling reader. How Drive names conflict copies and whether it uploads Chrome's hidden `.crswap` swap file are unverified; the conflict-name pattern is deliberately broad.
- Power loss. SIGKILL cannot lose data the OS has already accepted, so fsync ordering is by design (flush the temp file, rename, flush the folder) but untested.
- Firefox, Safari and Edge. Firefox and Edge are expected to work for the download/upload path; not run.
- Two tabs of the same page against one browser copy. Not handled yet.

## Manual check (2 minutes, in the DM's Chrome)
1. Open `persistence-spike.html` by double-clicking it. Click **New database**, **Add 100 edits**, **Checkpoint**, **Add 100 edits**.
2. **Save As…** and pick a file inside the Google Drive folder. Add edits, tick **Autosave**; the status line's "unsaved lines" should return to 0 after about 2 seconds.
3. Close the tab, reopen the page, click **Open file…**, choose the same file. Status should show the same change-set count.
4. Add an edit and, before saving, close Chrome from Task Manager (End process). Reopen, **Recover from this browser…**: the edit should be there.
5. If a second computer has the same Drive folder, save from both without waiting for sync. The second save should say the file changed and refuse; look in the folder for a conflicted copy and tell us its exact name.
