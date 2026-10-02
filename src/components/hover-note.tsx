import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { StateMark, type MarkKind } from "@/components/marks";
import { cn } from "@/lib/utils";

/** What a note is about, for its edge: a problem, someone off, covered, or nothing in particular. */
export type NoteTone = "bad" | "off" | "ok" | "plain";

/** The mark a note leads with: the same mark as the thing being pointed at, or a store tag. */
export type NoteMark = { kind: MarkKind } | { store: string } | null;

const EDGE: Record<NoteTone, string> = { bad: "border-t-illegal", off: "border-t-warn", ok: "border-t-ok", plain: "border-t-transparent" };

/** "Open this day", "Click to …": what a click does, kept apart from the facts under a hairline. */
const ACTION = /^(open this|open the|open that|click |tap )/i;

/**
 * The body of every hover note: an edge in the subject's colour, its mark beside the title, the facts, and what a click
 * does as a footer. Colour never carries it alone: the mark and the words say the same thing.
 */
export function NoteBody({ lines, tone = "plain", mark = null }: { lines: string[]; tone?: NoteTone; mark?: NoteMark }) {
  const last = lines.length > 1 && ACTION.test(lines[lines.length - 1]!) ? lines[lines.length - 1]! : null;
  const facts = last ? lines.slice(0, -1) : lines;
  return (
    <>
      <span aria-hidden data-note-edge={tone} className={cn("absolute inset-x-0 top-0 h-0 rounded-t-lg border-t-[3px]", EDGE[tone])} />
      {facts.map((l, i) =>
        i === 0 ? (
          <p key={i} className="flex items-center gap-1.5 font-semibold">
            {mark ? (
              "kind" in mark ? (
                <StateMark kind={mark.kind} size={16} tip={false} />
              ) : (
                <span data-note-store className="rounded-[4px] bg-ink px-1 text-[10px] leading-4 font-bold text-cream">
                  {mark.store}
                </span>
              )
            ) : null}
            <span>{l}</span>
          </p>
        ) : (
          <p key={i} className="text-muted">
            {l}
          </p>
        ),
      )}
      {last ? (
        <p data-note-action className="mt-1.5 border-t border-black/10 pt-1 text-[11px] font-medium text-ink/70">
          {last}
        </p>
      ) : null}
    </>
  );
}

/** Reads the tone and mark a hover target asks for: `data-tip-tone="bad"`, `data-tip-mark="hole"` or `"store:EST"`. */
export function noteStyleOf(el: Element): { tone: NoteTone; mark: NoteMark } {
  const t = el.getAttribute("data-tip-tone");
  const m = el.getAttribute("data-tip-mark");
  const tone: NoteTone = t === "bad" || t === "off" || t === "ok" ? t : "plain";
  const mark: NoteMark = !m ? null : m.startsWith("store:") ? { store: m.slice(6) } : { kind: m as MarkKind };
  return { tone, mark };
}

/**
 * Notes open on right click (the menu key / Shift+F10 on the keyboard, a long press on touch), never on hover. Pointing at
 * something that has a note only draws a tiny marker on its corner, so you can tell more is there. One note at a time.
 */
const CLOSE = "hischool-close-notes";
/** Close every open note. Anything about to open one calls this first. */
export function closeNotes() {
  window.dispatchEvent(new Event(CLOSE));
}

type Marker = { left: number; top: number; tone: NoteTone } | null;
let marker: Marker = null;
const markerListeners = new Set<() => void>();
const setMarker = (m: Marker) => {
  marker = m;
  markerListeners.forEach((f) => f());
};
/** Draw the "more here" marker on a noted element's corner. Mouse, pen and keyboard focus only. */
export function armMarker(el: Element, tone: NoteTone = "plain") {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const next = { left: Math.min(Math.max(r.right - 11, 2), window.innerWidth - 20), top: Math.max(r.top - 5, 2), tone };
  if (marker && marker.left === next.left && marker.top === next.top && marker.tone === tone) return;
  setMarker(next);
}
export function clearMarker() {
  if (marker) setMarker(null);
}

const DOT: Record<NoteTone, string> = { bad: "bg-illegal", off: "bg-warn", ok: "bg-ok", plain: "bg-ink/55" };

/** The marker itself: a small white chip with three dots in the subject's colour. Mounted once, with the hover notes. */
export function NoteMarker() {
  const m = useSyncExternalStore(
    (f) => (markerListeners.add(f), () => void markerListeners.delete(f)),
    () => marker,
  );
  if (!m) return null;
  return (
    <span
      aria-hidden
      data-note-marker={m.tone}
      style={{ left: m.left, top: m.top }}
      className="note-marker pointer-events-none fixed z-[59] flex h-[11px] w-[17px] items-center justify-center gap-[2px] rounded-[4px] bg-white shadow-sm ring-1 ring-black/30 print:hidden"
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("size-[3px] rounded-full", DOT[m.tone])} />
      ))}
    </span>
  );
}

/** A long press on touch, which has no right click. The click that follows the press is swallowed so it doesn't also act. */
let swallowClickUntil = 0;
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      if (Date.now() < swallowClickUntil) {
        swallowClickUntil = 0;
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
const HOLD_MS = 500;
export function longPress(onFire: () => void) {
  let timer = 0;
  let sx = 0;
  let sy = 0;
  const stop = () => window.clearTimeout(timer);
  return {
    onPointerDown: (e: { pointerType: string; clientX: number; clientY: number }) => {
      if (e.pointerType !== "touch") return;
      sx = e.clientX;
      sy = e.clientY;
      stop();
      timer = window.setTimeout(() => {
        swallowClickUntil = Date.now() + 1200;
        onFire();
      }, HOLD_MS);
    },
    onPointerMove: (e: { clientX: number; clientY: number }) => {
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
  };
}

/** Where a right click opens a note: at the pointer, or on the element when the menu key started it (no pointer position). */
export function menuPoint(e: { clientX: number; clientY: number; currentTarget: Element }): { x: number; y: number } {
  if (e.clientX === 0 && e.clientY === 0) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top };
  }
  return { x: e.clientX, y: e.clientY };
}

type Note = { x: number; y: number; dx: number; lines: string[]; tone: NoteTone; mark: NoteMark };

/**
 * A rich hover/focus note for a picture whose text is worked out on demand (a grid cell, a bar). The `fixed` card sits
 * above everything, so no header clips it. Call `show` from pointer or focus handlers and `hide` when they leave.
 */
export function useNote() {
  const [note, setNote] = useState<Note | null>(null);
  const show = useCallback((x: number, y: number, lines: string[], style?: { tone?: NoteTone; mark?: NoteMark }) => {
    closeNotes();
    const half = 136;
    const cx = Math.min(Math.max(x, half), Math.max(half, window.innerWidth - half));
    setNote({ x: cx, y, dx: x - cx, lines, tone: style?.tone ?? "plain", mark: style?.mark ?? null });
  }, []);
  const hide = useCallback(() => setNote(null), []);
  // Open until you click elsewhere, press Escape, scroll, or another note opens.
  const isOpen = note != null;
  useEffect(() => {
    if (!isOpen) return;
    const off = () => setNote(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && off();
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", off, true);
    window.addEventListener(CLOSE, off);
    return () => {
      document.removeEventListener("pointerdown", off);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", off, true);
      window.removeEventListener(CLOSE, off);
    };
  }, [isOpen]);
  const card = note ? (
    <div
      role="tooltip"
      style={{ left: note.x, top: note.y }}
      className="pointer-events-none fixed z-[60] w-max max-w-[17rem] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg bg-white px-3 pt-2.5 pb-2 text-xs leading-snug text-ink shadow-xl ring-1 ring-black/10 print:hidden"
    >
      <NoteBody lines={note.lines} tone={note.tone} mark={note.mark} />
      <span aria-hidden className="absolute -bottom-1 size-2 rotate-45 bg-white ring-1 ring-black/10 [clip-path:polygon(100%_0,100%_100%,0_100%)]" style={{ left: `calc(50% + ${note.dx}px - 4px)` }} />
    </div>
  ) : null;
  return { show, hide, card, open: note != null };
}
