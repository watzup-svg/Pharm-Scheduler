import { useEffect, useState } from "react";
import { armMarker, clearMarker, closeNotes, longPress, NoteBody, NoteMarker, noteStyleOf, type NoteMark, type NoteTone } from "@/components/hover-note";

/**
 * One note for the whole app, opened on right click. Anything with a `title` or `data-tip` has one (the browser's own
 * tooltip is replaced, and the text is kept as the accessible name). Pictures with an accessible name (`role="img"`,
 * calendar days) use that name. Pieces that draw their own richer note mark themselves `data-notip`.
 * Pointing at something with a note only draws a tiny marker on its corner. The note opens on right click, the menu key
 * (Shift+F10), or a long press on touch; it closes on a click elsewhere, Escape, scrolling, or when another opens.
 * Text fields, and anything without a note, keep the browser's own right-click menu.
 */
const SEL = "[data-tip],[title],[role='img'][aria-label],[data-day][aria-label]";

const INTERACTIVE = "button,a,[role='button'],[role='gridcell'],[role='tab'],[role='menuitem'],input,select,textarea,summary";

/**
 * Which element's note applies to what the pointer is on: the nearest one, and only if it really belongs to this spot.
 *  - Inside an area that draws its own richer note (`data-notip`), nothing here applies.
 *  - A control with no note of its own does not borrow the note of the card it sits in.
 */
function resolve(target: EventTarget | null): HTMLElement | null {
  const t = target as Element | null;
  if (!t?.closest || t.closest("[data-notip]")) return null;
  const el = t.closest(SEL) as HTMLElement | null;
  if (!el) return null;
  const control = t.closest(INTERACTIVE) as HTMLElement | null;
  // (A disabled control cannot be pointed at, so its container's note stands in for it.)
  if (control && control !== el && el.contains(control) && !(control as HTMLButtonElement).disabled) return null;
  return el;
}

type Note = { x: number; y: number; dx: number; below: boolean; lines: string[]; tone: NoteTone; mark: NoteMark };

/** `data-tip-place="below"`: the note hangs under the control instead of following the pointer, so it never covers what is above. */
const below = (el: HTMLElement) => el.getAttribute("data-tip-place") === "below";

function textOf(el: HTMLElement): { text: string; aria: boolean } | null {
  const t = el.getAttribute("data-tip");
  if (t) return { text: t, aria: false };
  const title = el.getAttribute("title");
  if (title) {
    el.setAttribute("data-tip", title);
    // The title was the only name for an icon-only control; keep it as the accessible name before dropping it.
    if (!el.hasAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", title);
    el.removeAttribute("title");
    return { text: title, aria: false };
  }
  const aria = el.getAttribute("aria-label");
  return aria ? { text: aria, aria: true } : null;
}

/** Text fields keep the browser's own menu (paste, spell check…). So does a right click on text the person has selected. */
const FIELD = "input,textarea,select,[contenteditable='true']";

export function HoverTips() {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    const open = (el: HTMLElement, x: number, y: number) => {
      if (el.closest("[data-notip]")) return;
      const got = textOf(el);
      if (!got) return;
      const lines = got.text
        .split(got.aria ? /\s*\|\s*|\.\s+(?=[A-Z0-9])/ : /\s*\|\s*/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4);
      if (!lines.length) return;
      closeNotes();
      const half = 128;
      const style = noteStyleOf(el);
      if (below(el)) {
        const r = el.getBoundingClientRect();
        const bx = Math.min(Math.max(r.left + r.width / 2, half), Math.max(half, window.innerWidth - half));
        setNote({ x: bx, y: r.bottom - 8, dx: 0, below: true, lines, ...style });
        return;
      }
      const cx = Math.min(Math.max(x, half), Math.max(half, window.innerWidth - half));
      setNote({ x: cx, y, dx: x - cx, below: y < 90, lines, ...style });
    };
    // Pointing at something with a note: only the marker. (Taking the text out of `title` happens here too, so the
    // browser's own tooltip never shows.)
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = resolve(e.target);
      if (!el || !textOf(el)) return clearMarker();
      armMarker(el, noteStyleOf(el).tone);
    };
    const focus = (e: FocusEvent) => {
      const el = resolve(e.target);
      if (!el || !(e.target as HTMLElement).matches?.(":focus-visible") || !textOf(el)) return;
      armMarker(el, noteStyleOf(el).tone);
    };
    // Right click, or the menu key / Shift+F10 on the focused element (which has no pointer position).
    const menu = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest || t.closest(FIELD) || window.getSelection()?.toString()) return;
      const el = resolve(t);
      if (!el || !textOf(el)) return;
      e.preventDefault();
      if (e.clientX === 0 && e.clientY === 0) {
        const r = el.getBoundingClientRect();
        open(el, r.left + r.width / 2, r.top);
      } else open(el, e.clientX, e.clientY);
    };
    let timer = 0;
    // Touch has no right click: a long press opens the note. A plain tap on a picture that is not itself a button also
    // reads it for a few seconds (nothing else would happen).
    let held: ReturnType<typeof longPress> | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const el = resolve(e.target);
      if (!el || t_in_field(e.target) || !textOf(el)) return (held = null);
      held = longPress(() => {
        const r = el.getBoundingClientRect();
        open(el, r.left + r.width / 2, r.top);
      });
      held.onPointerDown(e);
    };
    const move = (e: PointerEvent) => held?.onPointerMove(e);
    const up = (e: PointerEvent) => {
      held?.onPointerUp();
      held = null;
      if (e.pointerType !== "touch") return;
      const el = resolve(e.target);
      window.clearTimeout(timer);
      if (!el || el.closest("button,a,[role='button'],[role='gridcell'],input,select,textarea,summary,[data-notip]")) return;
      const r = el.getBoundingClientRect();
      open(el, r.left + r.width / 2, r.top);
      timer = window.setTimeout(() => setNote(null), 3500);
    };
    const hide = () => setNote(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("contextmenu", menu);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", clearMarker);
    document.addEventListener("pointerleave", clearMarker);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("scroll", clearMarker, true);
    window.addEventListener("hischool-close-notes", hide);
    return () => {
      document.removeEventListener("contextmenu", menu);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", clearMarker);
      document.removeEventListener("pointerleave", clearMarker);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("scroll", clearMarker, true);
      window.removeEventListener("hischool-close-notes", hide);
    };
  }, []);
  return (
    <>
      <NoteMarker />
      {note ? (
        <div
          role="presentation"
          style={{ left: note.x, top: note.y }}
          data-hover-note
          className={`pointer-events-none fixed z-[60] w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-white px-3 pt-2.5 pb-2 text-xs leading-snug text-ink shadow-xl ring-1 ring-black/10 print:hidden ${note.below ? "translate-y-4" : "-translate-y-[calc(100%+12px)]"}`}
        >
          <NoteBody lines={note.lines} tone={note.tone} mark={note.mark} />
          {note.below ? null : <span aria-hidden className="absolute -bottom-1 size-2 rotate-45 bg-white ring-1 ring-black/10 [clip-path:polygon(100%_0,100%_100%,0_100%)]" style={{ left: `calc(50% + ${note.dx}px - 4px)` }} />}
        </div>
      ) : null}
    </>
  );
}

const t_in_field = (t: EventTarget | null) => Boolean((t as Element | null)?.closest?.(FIELD));
