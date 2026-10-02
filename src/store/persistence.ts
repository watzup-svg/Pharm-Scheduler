// What this browser keeps for the person: copies before a replace, one copy per month, the autosave and the "save to the file
// automatically" switch. Every function here is a convenience that never blocks an edit.
import { addBackup, loadBackups, saveBackups, type Backup, type BackupReason } from "../lib/schedule/backup.ts";
import { loadArchive, monthKey, putMonth, saveArchive } from "../lib/schedule/archive.ts";
import { DEMO_FILE_NAME } from "../lib/schedule/demo.ts";
import { AUTOSAVE_KEY, isUsableAutosave, parseDoc, serializeDoc } from "../lib/schedule/file.ts";
import { SAMPLE_FILE_NAME } from "../lib/schedule/sample.ts";
import type { ScheduleDoc } from "../lib/schedule/types.ts";

export function backupNow(doc: ScheduleDoc, fileName: string, reason: BackupReason) {
  if (typeof localStorage === "undefined") return;
  try {
    const entry: Backup = { at: Date.now(), reason, fileName, year: doc.year, month: doc.month, json: serializeDoc(doc) };
    saveBackups(localStorage, addBackup(loadBackups(localStorage), entry));
  } catch {
    /* backups are a convenience; never block an edit */
  }
}

/** Keep one copy of each month in this browser for comparing and going back. Never blocks an edit. */
export function archiveNow(doc: ScheduleDoc, fileName: string, automatic = false) {
  if (typeof localStorage === "undefined") return;
  // The practice month and the September sample are made-up data. Their automatic copies must never
  // replace a real month kept under the same year and month.
  if (automatic && (fileName === DEMO_FILE_NAME || fileName === SAMPLE_FILE_NAME)) return;
  try {
    saveArchive(
      localStorage,
      putMonth(loadArchive(localStorage), {
        ym: monthKey(doc.year, doc.month),
        savedAt: Date.now(),
        fileName,
        json: serializeDoc(doc),
      }),
    );
  } catch {
    /* a convenience */
  }
}

export const AUTOFILE_KEY = "hischool-schedule-autofile";
export function readAutoFile(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(AUTOFILE_KEY) === "1";
  } catch {
    return false;
  }
}

export function readAutosave(): { doc: ScheduleDoc; fileName: string; dirty: boolean } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { doc: unknown; fileName?: string; dirty?: boolean };
    const doc = parseDoc(JSON.stringify(parsed.doc));
    if (!isUsableAutosave(doc)) return null;
    return {
      doc,
      fileName: parsed.fileName || SAMPLE_FILE_NAME,
      dirty: Boolean(parsed.dirty),
    };
  } catch {
    return null;
  }
}
