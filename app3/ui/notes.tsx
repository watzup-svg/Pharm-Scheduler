// Hover notes, carried over from the old scheduler (desktop only). Pointing at something with a note draws a tiny marker on its
// corner; the note opens on right click, or the menu key / Shift+F10 on the focused element; Escape, a click elsewhere or scrolling closes it.
// Format is "Title | line | line". Anything with `title` or `data-tip` has one. The same facts are always in the Inspector, so a note is never the only place.
import { useEffect, useState, useSyncExternalStore } from "react";
import { cx } from "./primitives.tsx";
import { StateMark, type MarkKind } from "./icons.tsx";

export type NoteTone = "bad" | "off" | "ok" | "plain";
export type NoteMark = { kind: MarkKind } | { store: string } | null;
const EDGE: Record<NoteTone, string> = { bad: "border-t-illegal", off: "border-t-warn", ok: "border-t-ok", plain: "border-t-transparent" };
const ACTION = /^(open this|open the|open that|click )/i;

export function NoteBody({ lines, tone = "plain", mark = null }: { lines: string[]; tone?: NoteTone; mark?: NoteMark }) {
  const last = lines.length > 1 && ACTION.test(lines[lines.length - 1]!) ? lines[lines.length - 1]! : null;
  const facts = last ? lines.slice(0, -1) : lines;
  return (
    <>
      <span aria-hidden data-note-edge={tone} className={cx("absolute inset-x-0 top-0 h-0 rounded-t-lg border-t-[3px]", EDGE[tone])} />
      {facts.map((l, i) =>
        i === 0 ? (
          <p key={i} className="flex items-center gap-1.5 font-semibold">
            {mark ? "kind" in mark ? <StateMark kind={mark.kind} size={16} /> : <span data-note-store className="rounded-[4px] bg-ink px-1 text-[11px] leading-4 font-bold text-cream">{mark.store}</span> : null}
            <span>{l}</span>
          </p>
        ) : (
          <p key={i} className="text-muted">{l}</p>
        ),
      )}
      {last ? <p data-note-action className="mt-1.5 border-t border-black/10 pt-1 text-xs font-medium text-ink/70">{last}</p> : null}
    </>
  );
}

/** `data-tip-tone="bad|off|ok"`, `data-tip-mark="open"` (a MarkKind) or `"store:EST"`. */
export function noteStyleOf(el: Element): { tone: NoteTone; mark: NoteMark } {
  const t = el.getAttribute("data-tip-tone");
  const m = el.getAttribute("data-tip-mark");
  const tone: NoteTone = t === "bad" || t === "off" || t === "ok" ? t : "plain";
  const mark: NoteMark = !m ? null : m.startsWith("store:") ? { store: m.slice(6) } : { kind: m as MarkKind };
  return { tone, mark };
}

const CLOSE = "hs-close-notes";
export function closeNotes() { window.dispatchEvent(new Event(CLOSE)); }

type Marker = { left: number; top: number; tone: NoteTone } | null;
let marker: Marker = null;
const listeners = new Set<() => void>();
const setMarker = (m: Marker) => { marker = m; listeners.forEach((f) => f()); };
function armMarker(el: Element, tone: NoteTone) {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const next = { left: Math.min(Math.max(r.right - 11, 2), window.innerWidth - 20), top: Math.max(r.top - 5, 2), tone };
  if (marker && marker.left === next.left && marker.top === next.top && marker.tone === tone) return;
  setMarker(next);
}
const clearMarker = () => { if (marker) setMarker(null); };
const DOT: Record<NoteTone, string> = { bad: "bg-illegal", off: "bg-warn", ok: "bg-ok", plain: "bg-ink/55" };

function NoteMarker() {
  const m = useSyncExternalStore((f) => (listeners.add(f), () => void listeners.delete(f)), () => marker);
  if (!m) return null;
  return (
    <span aria-hidden data-note-marker={m.tone} style={{ left: m.left, top: m.top }} className="pointer-events-none fixed z-[59] flex h-[11px] w-[17px] items-center justify-center gap-[2px] rounded-[4px] bg-white shadow-sm ring-1 ring-black/30">
      {[0, 1, 2].map((i) => <span key={i} className={cx("size-[3px] rounded-full", DOT[m.tone])} />)}
    </span>
  );
}

const SEL = "[data-tip],[title],[role='img'][aria-label]";
const INTERACTIVE = "button,a,[role='button'],[role='gridcell'],[role='tab'],[role='menuitem'],input,select,textarea,summary";
const FIELD = "input,textarea,select,[contenteditable='true']";

function resolve(target: EventTarget | null): HTMLElement | null {
  const t = target as Element | null;
  if (!t?.closest || t.closest("[data-notip]")) return null;
  const el = t.closest(SEL) as HTMLElement | null;
  if (!el) return null;
  const control = t.closest(INTERACTIVE) as HTMLElement | null;
  if (control && control !== el && el.contains(control) && !(control as HTMLButtonElement).disabled) return null;
  return el;
}
function textOf(el: HTMLElement): string | null {
  const t = el.getAttribute("data-tip");
  if (t) return t;
  const title = el.getAttribute("title");
  if (title) {
    el.setAttribute("data-tip", title);
    // The title may be the only name an icon-only control has; keep it as the accessible name before dropping it.
    if (!el.hasAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", title);
    el.removeAttribute("title");
    return title;
  }
  return null;
}

type Note = { x: number; y: number; dx: number; below: boolean; lines: string[]; tone: NoteTone; mark: NoteMark };

export function HoverNotes() {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    const open = (el: HTMLElement, x: number, y: number) => {
      const text = textOf(el);
      if (!text) return;
      const lines = text.split(/\s*\|\s*/).map((l) => l.trim()).filter(Boolean).slice(0, el.hasAttribute("data-tip-list") ? 8 : 4);
      if (!lines.length) return;
      closeNotes();
      const half = 128;
      const cx0 = Math.min(Math.max(x, half), Math.max(half, window.innerWidth - half));
      setNote({ x: cx0, y, dx: x - cx0, below: y < 90, lines, ...noteStyleOf(el) });
    };
    const over = (e: PointerEvent) => {
      const el = resolve(e.target);
      if (!el || !textOf(el)) return clearMarker();
      armMarker(el, noteStyleOf(el).tone);
    };
    const focus = (e: FocusEvent) => {
      const el = resolve(e.target);
      if (!el || !(e.target as HTMLElement).matches?.(":focus-visible") || !textOf(el)) return;
      armMarker(el, noteStyleOf(el).tone);
    };
    const menu = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest || t.closest(FIELD) || window.getSelection()?.toString()) return;
      const el = resolve(t);
      if (!el || !textOf(el)) return;
      e.preventDefault();
      if (e.clientX === 0 && e.clientY === 0) { const r = el.getBoundingClientRect(); open(el, r.left + r.width / 2, r.top); } else open(el, e.clientX, e.clientY);
    };
    const hide = () => setNote(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("contextmenu", menu);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", clearMarker);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("scroll", clearMarker, true);
    window.addEventListener(CLOSE, hide);
    return () => {
      document.removeEventListener("contextmenu", menu);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", clearMarker);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("scroll", clearMarker, true);
      window.removeEventListener(CLOSE, hide);
    };
  }, []);
  return (
    <>
      <NoteMarker />
      {note ? (
        <div role="presentation" style={{ left: note.x, top: note.y }} data-hover-note className={`pointer-events-none fixed z-[60] w-max max-w-[17rem] -translate-x-1/2 rounded-lg bg-white px-3 pt-2.5 pb-2 text-xs leading-snug text-ink shadow-xl ring-1 ring-black/10 print:hidden ${note.below ? "translate-y-4" : "-translate-y-[calc(100%+12px)]"}`}>
          <NoteBody lines={note.lines} tone={note.tone} mark={note.mark} />
          {note.below ? null : <span aria-hidden className="absolute -bottom-1 size-2 rotate-45 bg-white ring-1 ring-black/10 [clip-path:polygon(100%_0,100%_100%,0_100%)]" style={{ left: `calc(50% + ${note.dx}px - 4px)` }} />}
        </div>
      ) : null}
    </>
  );
}
