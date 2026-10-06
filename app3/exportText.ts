// Pure helpers for every place the app writes text out for other programs (spreadsheet CSV, clipboard text, file names).
// No imports: runs under `node --experimental-strip-types --test` (tests in domain/test/export-injection.test.ts).

/** A string that a spreadsheet reads as a plain number (so a leading minus is not a formula). */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
/** First visible character is one a spreadsheet may take as the start of a formula, ignoring leading blanks, control and zero-width characters. */
const FORMULA_START = /^[\s\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\u2060\ufeff]*[=+\-@]/;

/**
 * One CSV field (RFC 4180 quoting). Text that could run as a spreadsheet formula (starts with = + - @, tab or CR) gets a leading
 * single quote and is always quoted, so Excel, Sheets and LibreOffice show it as text. Numbers and plain numeric strings pass through.
 */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  let force = false;
  if (!PLAIN_NUMBER.test(s) && (FORMULA_START.test(s) || /^[\t\r]/.test(s))) { s = `'${s}`; force = true; }
  return force || /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV record, no line terminator. */
export const csvLine = (cells: (string | number | null | undefined)[]): string => cells.map(csvCell).join(",");

/** Text for a one-line clipboard message: every line break, tab and control character becomes a space, so a name cannot start a new line (or row, when pasted into a spreadsheet). */
export function oneLine(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim();
}
