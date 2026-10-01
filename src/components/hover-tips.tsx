import { useEffect, useState } from "react";

/**
 * One hover note for the whole app. Anything with a `title` or `data-tip` shows it as a small card (the browser's own
 * tooltip is replaced, and the text is kept as the accessible name). Pictures with an accessible name (`role="img"`,
 * calendar days) show that name. Pieces that draw their own richer note mark themselves `data-notip`.
 * Mouse and pen hover, and keyboard focus. Touch has no hover, so the same words are read out instead.
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

type Note = { x: number; y: number; dx: number; below: boolean; lines: string[] };

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

export function HoverTips() {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement, x: number, y: number) => {
      if (el.closest("[data-notip]")) return;
      const got = textOf(el);
      if (!got) return;
      const lines = got.text
        .split(got.aria ? /\s*\|\s*|\.\s+(?=[A-Z0-9])/ : /\s*\|\s*/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4);
      if (!lines.length) return;
      const half = 128;
      const cx = Math.min(Math.max(x, half), Math.max(half, window.innerWidth - half));
      setNote({ x: cx, y, dx: x - cx, below: y < 90, lines });
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = resolve(e.target);
      if (!el) {
        current = null;
        setNote(null);
        return;
      }
      current = el;
      show(el, e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !current) return;
      setNote((n) => { if (!n) return n; const cx = Math.min(Math.max(e.clientX, 128), Math.max(128, window.innerWidth - 128)); return { ...n, x: cx, dx: e.clientX - cx, y: e.clientY, below: e.clientY < 90 }; });
    };
    const focus = (e: FocusEvent) => {
      const el = resolve(e.target);
      if (!el || !(e.target as HTMLElement).matches?.(":focus-visible")) return;
      const r = el.getBoundingClientRect();
      current = el;
      show(el, r.left + r.width / 2, r.top);
    };
    let timer = 0;
    // Touch has no hover: tapping a picture that is not itself a button shows its note for a few seconds.
    const tap = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const el = resolve(e.target);
      window.clearTimeout(timer);
      if (!el || el.closest("button,a,[role='button'],[role='gridcell'],input,select,textarea,summary,[data-notip]")) return setNote(null);
      const r = el.getBoundingClientRect();
      show(el, r.left + r.width / 2, r.top);
      timer = window.setTimeout(() => setNote(null), 3500);
    };
    const hide = () => {
      current = null;
      setNote(null);
    };
    document.addEventListener("pointerup", tap);
    document.addEventListener("pointerover", over);
    document.addEventListener("pointermove", move);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerleave", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("keydown", (e) => e.key === "Escape" && hide());
    return () => {
      document.removeEventListener("pointerup", tap);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerleave", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  if (!note) return null;
  return (
    <div
      role="presentation"
      style={{ left: note.x, top: note.y }}
      className={`pointer-events-none fixed z-[60] w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs leading-snug text-ink shadow-xl ring-1 ring-black/10 print:hidden ${note.below ? "translate-y-4" : "-translate-y-[calc(100%+12px)]"}`}
    >
      {note.lines.map((l, i) => (
        <p key={i} className={i === 0 ? "font-semibold" : "text-muted"}>
          {l}
        </p>
      ))}
      {note.below ? null : <span aria-hidden className="absolute -bottom-1 size-2 rotate-45 bg-white ring-1 ring-black/10 [clip-path:polygon(100%_0,100%_100%,0_100%)]" style={{ left: `calc(50% + ${note.dx}px - 4px)` }} />}
    </div>
  );
}
