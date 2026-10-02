import { useCallback, useState } from "react";
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

type Note = { x: number; y: number; dx: number; lines: string[]; tone: NoteTone; mark: NoteMark };

/**
 * A rich hover/focus note for a picture whose text is worked out on demand (a grid cell, a bar). The `fixed` card sits
 * above everything, so no header clips it. Call `show` from pointer or focus handlers and `hide` when they leave.
 */
export function useNote() {
  const [note, setNote] = useState<Note | null>(null);
  const show = useCallback((x: number, y: number, lines: string[], style?: { tone?: NoteTone; mark?: NoteMark }) => {
    const half = 136;
    const cx = Math.min(Math.max(x, half), Math.max(half, window.innerWidth - half));
    setNote({ x: cx, y, dx: x - cx, lines, tone: style?.tone ?? "plain", mark: style?.mark ?? null });
  }, []);
  const hide = useCallback(() => setNote(null), []);
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
