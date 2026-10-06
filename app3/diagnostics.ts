// Bounded flight recorder: the last 200 things that happened, for "Copy diagnostics". Schedule facts only (counts, hashes, short labels), no extra personal data.
export type DiagKind = "action" | "error" | "engine" | "persist" | "ui";
type Entry = { t: number; kind: DiagKind; text: string };
export type DiagContext = { view: string; counts: Record<string, number>; hash: string };

const MAX = 200;
const APP_VERSION = "v3";
const buf: Entry[] = [];
let ctx: (() => DiagContext | null) | null = null;

export function record(kind: DiagKind, text: string): void {
  buf.push({ t: Date.now(), kind, text: String(text).replace(/\s+/g, " ").slice(0, 240) });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}
export const entries = (): readonly Entry[] => buf;
export const clearDiagnostics = (): void => { buf.length = 0; };
/** The store registers how to read the current screen, world size and hash (keeps this file free of store imports). */
export function setContext(fn: () => DiagContext | null): void { ctx = fn; }

export function snapshot(): string {
  let c: DiagContext | null = null;
  try { c = ctx?.() ?? null; } catch (e) { record("error", `diagnostics context: ${String((e as Error)?.message ?? e)}`); }
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const scr = typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "?";
  const lines = [
    "Hi-School scheduler diagnostics",
    `App: ${APP_VERSION}`,
    `Browser: ${nav?.userAgent ?? "unknown"}`,
    `Screen: ${scr}, window ${typeof innerWidth === "number" ? `${innerWidth}x${innerHeight}` : "?"}`,
    `View: ${c?.view ?? "none"}`,
    `Schedule: ${c ? Object.entries(c.counts).map(([k, v]) => `${v} ${k}`).join(", ") : "none open"}`,
    `State hash: ${c?.hash ?? "n/a"}`,
    `Report time: ${new Date().toISOString()}`,
    "",
    `Recent entries (${buf.length}, oldest first):`,
  ];
  const t0 = buf[0]?.t ?? 0;
  for (const e of buf) lines.push(`+${((e.t - t0) / 1000).toFixed(1)}s ${e.kind}: ${e.text}`);
  return lines.join("\n");
}

/** Copy the report; if the clipboard is blocked, select it in a temporary textarea and try the old copy command. Returns true if copied. */
export async function copyDiagnostics(): Promise<boolean> {
  const text = snapshot();
  try { await navigator.clipboard.writeText(text); record("ui", "diagnostics copied"); return true; } catch { /* fall back */ }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("aria-label", "Diagnostics");
  ta.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* ignore */ }
  ta.remove();
  record("ui", ok ? "diagnostics copied (fallback)" : "diagnostics copy failed");
  return ok;
}
