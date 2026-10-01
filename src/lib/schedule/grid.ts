import type { Grid, SlotId } from "./types.ts";

export function getCell(grid: Grid, store: string, slot: SlotId, day: number): string {
  return grid[store]?.[slot]?.[String(day)] ?? "";
}

export function setCellValue(
  grid: Grid,
  store: string,
  slot: SlotId,
  day: number,
  name: string,
): Grid {
  const next: Grid = { ...grid, [store]: { ...grid[store] } };
  const row = { ...(next[store]?.[slot] ?? {}) };
  const key = String(day);
  if (name.trim()) row[key] = name.trim();
  else delete row[key];
  next[store] = { ...next[store], [slot]: row };
  return next;
}

export function namesOnStoreDay(grid: Grid, store: string, day: number): string[] {
  const slots = grid[store] ?? {};
  const names: string[] = [];
  for (const row of Object.values(slots)) {
    const n = row?.[String(day)]?.trim();
    if (n) names.push(n);
  }
  return names;
}
