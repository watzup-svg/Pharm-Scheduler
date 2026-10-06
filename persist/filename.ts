// File names made from text the person typed. Pure, no imports (tests: domain/test/export-injection.test.ts).

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * A file name safe on Windows, macOS and Linux, made from any text: no path separators, control or reserved characters, no reserved
 * Windows device names, no trailing dots or spaces, at most `max` characters (extension kept), never empty (falls back to `fallback`).
 */
export function safeFileName(raw: string, fallback = "Schedule.sqlite", max = 120): string {
  const clean = (t: string) => t
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u2064\ufeff\ud800-\udfff]/gu, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "");
  const fix = (t: string): string => {
    let name = clean(t);
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    let ext = dot > 0 ? name.slice(dot) : "";
    if (ext.length > 16) ext = ext.slice(0, 16);
    let s = stem;
    if (RESERVED.test(s.trim())) s = `_${s}`;
    if (s.length + ext.length > max) s = s.slice(0, Math.max(1, max - ext.length));
    // Do not cut a surrogate pair in half.
    if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
    name = `${s.replace(/[.\s]+$/, "")}${ext}`;
    return name;
  };
  const out = fix(String(raw ?? ""));
  return /[\p{L}\p{N}]/u.test(out) ? out : fix(fallback) || "Schedule.sqlite";
}
