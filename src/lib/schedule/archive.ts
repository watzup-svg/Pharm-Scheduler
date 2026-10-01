/** One saved copy per month, kept in the browser, so last month is always there for comparison and for going back. */

export type ArchiveEntry = {
  /** "2026-10" */
  ym: string;
  savedAt: number;
  fileName: string;
  json: string;
};

export const ARCHIVE_KEY = "hischool-schedule-archive-v1";
const MAX_MONTHS = 24;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function previousKey(year: number, month: number): string {
  return month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
}

/** Replace the entry for that month (or add it), newest month first, capped. */
export function putMonth(list: ArchiveEntry[], entry: ArchiveEntry, max = MAX_MONTHS): ArchiveEntry[] {
  return [entry, ...list.filter((e) => e.ym !== entry.ym)].sort((a, b) => b.ym.localeCompare(a.ym)).slice(0, max);
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadArchive(storage: Store | undefined): ArchiveEntry[] {
  try {
    const raw = storage?.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArchiveEntry[];
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.json === "string" && typeof e.ym === "string") : [];
  } catch {
    return [];
  }
}

/** Drops the oldest months until the browser accepts it. */
export function saveArchive(storage: Store | undefined, list: ArchiveEntry[]): boolean {
  if (!storage) return false;
  let next = list;
  while (true) {
    try {
      storage.setItem(ARCHIVE_KEY, JSON.stringify(next));
      return true;
    } catch {
      if (next.length <= 1) return false;
      next = next.slice(0, -1);
    }
  }
}
