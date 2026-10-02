import { driveKey } from "./geo.ts";

export type MilesImport = { pairs: Record<string, number>; problems: string[] };

/**
 * Reads pasted lines of "FROM,TO,MILES" (store codes; commas, tabs or semicolons; a header line is fine).
 * Bad lines are reported, never guessed. A pair given twice keeps the last value and says so.
 */
export function parseMilesLines(text: string, codes: string[]): MilesImport {
  const known = new Set(codes.map((c) => c.toUpperCase()));
  const pairs: Record<string, number> = {};
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const [a, b, m] = [cells[0]?.toUpperCase() ?? "", cells[1]?.toUpperCase() ?? "", cells[2] ?? ""];
    if (i === 0 && !known.has(a) && !/^\d/.test(m)) return;
    const miles = Number(m.replace(/\s*mi(les)?$/i, ""));
    if (cells.length < 3 || !known.has(a) || !known.has(b)) return void problems.push(`Line ${i + 1}: unknown store code in “${line.slice(0, 40)}”`);
    if (a === b) return void problems.push(`Line ${i + 1}: ${a} to itself`);
    if (!Number.isFinite(miles) || miles < 0.1 || miles > 2000) return void problems.push(`Line ${i + 1}: miles “${m}” is not a usable number`);
    const key = driveKey(a, b);
    if (key in pairs && pairs[key] !== Math.round(miles * 10) / 10) problems.push(`Line ${i + 1}: ${a}↔${b} given twice, using the later value`);
    pairs[key] = Math.round(miles * 10) / 10;
  });
  return { pairs, problems };
}
