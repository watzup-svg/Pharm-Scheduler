import { useCallback, useState } from "react";

type Note = { x: number; y: number; dx: number; lines: string[] };

/**
 * A rich hover/focus note for a picture whose text is worked out on demand (a grid cell, a bar). The `fixed` card sits
 * above everything, so no header clips it. Call `show` from pointer or focus handlers and `hide` when they leave.
 */
export function useNote() {
  const [note, setNote] = useState<Note | null>(null);
  const show = useCallback((x: number, y: number, lines: string[]) => {
    const half = 136;
    const cx = Math.min(Math.max(x, half), Math.max(half, window.innerWidth - half));
    setNote({ x: cx, y, dx: x - cx, lines });
  }, []);
  const hide = useCallback(() => setNote(null), []);
  const card = note ? (
    <div
      role="tooltip"
      style={{ left: note.x, top: note.y }}
      className="pointer-events-none fixed z-[60] w-max max-w-[17rem] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg bg-white px-3 py-2 text-xs leading-snug text-ink shadow-xl ring-1 ring-black/10 print:hidden"
    >
      {note.lines.map((l, i) => (
        <p key={i} className={i === 0 ? "font-semibold" : "text-muted"}>
          {l}
        </p>
      ))}
      <span aria-hidden className="absolute -bottom-1 size-2 rotate-45 bg-white ring-1 ring-black/10 [clip-path:polygon(100%_0,100%_100%,0_100%)]" style={{ left: `calc(50% + ${note.dx}px - 4px)` }} />
    </div>
  ) : null;
  return { show, hide, card, open: note != null };
}
