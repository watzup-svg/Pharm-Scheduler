// The Key (a small list of colours and picture colours) and the colour table the Icon guide reuses. Pictures come from the same table as the wall: ui/icons.tsx.
import { BlockMark, MARK_TONE, TONE_TITLE, type MarkKind, type MarkTone } from "../../ui/icons.tsx";
import { cx } from "../../ui/primitives.tsx";
import type { Axis } from "../../store.ts";
import type { Block } from "./model.ts";

/** A little block in the colour a cell gets. Same class and data attribute as the cells, so the key cannot drift from the wall. */
export function Swatch({ block, mark, n, past }: { block: Block; mark?: MarkKind; n?: number; past?: boolean }) {
  return (
    <span className={cx("w-sw", past && "w-past")} aria-hidden="true">
      <span className={cx("w-block", (block === "closed" || block === "away") && "hatch")} data-block={block}>
        {mark && <BlockMark kind={mark} n={n} size={18} />}
      </span>
    </span>
  );
}

/** The colours, per axis. One line each; the words here are the only place they are written down besides the Icon guide. */
export const COLOURS: Record<Axis, { block: Block; mark?: MarkKind; n?: number; past?: boolean; name: string; line: string }[]> = {
  store: [
    { block: "good", name: "Green", line: "Covered. Nothing to look at." },
    { block: "open", mark: "open", name: "Pink", line: "Needs cover. A number shows when more than one is missing." },
    { block: "closed", name: "Hatched", line: "The store is closed that day." },
    { block: "good", past: true, name: "Faded", line: "A day that has passed. No problem pictures." },
  ],
  pharmacist: [
    { block: "good", name: "Green", line: "Working, with the store's code. Nothing to look at." },
    { block: "away", name: "Pink hatch", line: "Time off, approved." },
    { block: "req", name: "Yellow", line: "Time off asked for, not decided." },
  ],
};

const TONES: MarkTone[] = ["bad", "warn", "quiet"];
/** One example picture per colour of picture, from the table (the first kind of each tone). */
export function exampleOf(tone: MarkTone): MarkKind {
  const order: MarkKind[] = ["licence", "drive", "short"];
  return order.find((k) => MARK_TONE[k] === tone)!;
}

export function KeyPanelBody({ axis }: { axis: Axis }) {
  return (
    <div className="flex flex-col gap-1.5">
      {COLOURS[axis].map((c) => (
        <div key={c.name} className="w-key-item"><Swatch block={c.block} mark={c.mark} n={c.n} past={c.past} /><span><b>{c.name}</b> <span className="text-muted">{c.line}</span></span></div>
      ))}
      <div className="mt-1 border-t border-line pt-2" />
      {TONES.map((t) => (
        <div key={t} className="w-key-item"><BlockMark kind={exampleOf(t)} tone={t} size={20} /><span><b>{TONE_TITLE[t].title} picture</b> <span className="text-muted">{TONE_TITLE[t].line}</span></span></div>
      ))}
    </div>
  );
}
