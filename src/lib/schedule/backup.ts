/** Rolling backups kept in the browser, so a replaced month can be brought back. Pure list logic plus a thin storage layer. */

export type BackupReason = "save" | "autosave" | "before-replace";

export type Backup = {
  at: number;
  reason: BackupReason;
  fileName: string;
  year: number;
  month: number;
  json: string;
};

const BACKUP_KEY = "hischool-schedule-backups-v1";
const MAX_BACKUPS = 8;
/** An autosave backup within this window replaces the last one instead of adding another. */
const AUTOSAVE_GAP_MS = 10 * 60 * 1000;

export function addBackup(
  list: Backup[],
  entry: Backup,
  opts: { max?: number; minGapMs?: number } = {},
): Backup[] {
  const max = opts.max ?? MAX_BACKUPS;
  const gap = opts.minGapMs ?? AUTOSAVE_GAP_MS;
  const newestFirst = [...list].sort((a, b) => b.at - a.at);
  const last = newestFirst[0];
  const rest =
    entry.reason === "autosave" && last && last.reason === "autosave" && entry.at - last.at < gap
      ? newestFirst.slice(1)
      : newestFirst;
  // Same content as the newest entry adds nothing.
  if (rest[0] && rest[0].json === entry.json && entry.reason !== "before-replace") return rest.slice(0, max);
  return [entry, ...rest].slice(0, max);
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadBackups(storage: Store | undefined): Backup[] {
  try {
    const raw = storage?.getItem(BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Backup[];
    return Array.isArray(parsed) ? parsed.filter((b) => b && typeof b.json === "string") : [];
  } catch {
    return [];
  }
}

/** Returns false when the browser refused (full or blocked). Drops the oldest until it fits. */
export function saveBackups(storage: Store | undefined, list: Backup[]): boolean {
  if (!storage) return false;
  let next = list;
  while (true) {
    try {
      storage.setItem(BACKUP_KEY, JSON.stringify(next));
      return true;
    } catch {
      if (next.length <= 1) return false;
      next = next.slice(0, -1);
    }
  }
}
