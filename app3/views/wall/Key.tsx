// The Key (a small list of colours and picture colours) and the colour table the Icon guide reuses. Pictures come from the same table as the wall: ui/icons.tsx.
import { BlockMark, MARK_TONE, TONE_TITLE, type MarkKind, type MarkTone } from "../../ui/icons.tsx";
import { cx } from "../../ui/primitives.tsx";
import type { Axis } from "../../store.ts";
import type { Block } from "./model.ts";

/** A little block in the colour a cell gets. Same class and data attribute as the cells, so the key cannot drift from the wall. */
export function Swatch({ block, mark, n, past, sev }: { block: Block; mark?: MarkKind; n?: number; past?: boolean; sev?: MarkTone }) {
  return (
    <span className={cx("w-sw", past && "w-past")} aria-hidden="true">
      <span className={cx("w-block", (block === "closed" || block === "away") && "hatch")} data-block={block} data-sev={sev}>
        {mark && <BlockMark kind={mark} n={n} size={18} />}
      </span>
    </span>
  );
}

/** The colours, per axis. One line each; the words here are the only place they are written down besides the Icon guide. */
export const COLOURS: Record<Axis, { block: Block; mark?: MarkKind; n?: number; past?: boolean; sev?: MarkTone; name: string; line: string }[]> = {
  store: [
    { block: "good", name: "Green", line: "Covered. Nothing to look at." },
    { block: "good", sev: "warn", mark: "drive", name: "Yellow", line: "Covered, but take a look (a long drive, many days in a row)." },
    { block: "open", sev: "bad", mark: "open", name: "Red", line: "Needs cover, or a rule is broken. A number shows when more than one is missing." },
    { block: "closed", name: "Hatched", line: "The store is closed that day." },
    { block: "good", past: true, sev: "warn", mark: "drive", name: "Faded", line: "A day that has passed (no pictures), or a problem you accepted that is still true (the picture stays, faded)." },
  ],
  pharmacist: [
    { block: "good", name: "Green", line: "Working, with the store's code. Nothing to look at." },
    { block: "good", sev: "warn", mark: "drive", name: "Yellow", line: "Working, but take a look." },
    { block: "good", sev: "bad", mark: "double", name: "Red", line: "A rule is broken for this person that day." },
  ],
};

/** The Time off screen's colours: one line each. Printed in its Key and in the Icon guide. */
export const TIMEOFF_COLOURS: { block: Block; mark?: MarkKind; sev?: MarkTone; past?: boolean; name: string; line: string }[] = [
  { block: "work", name: "Working", line: "No time off. The store code shows where they work, as on the Schedule's People rows." },
  { block: "req", mark: "waiting", sev: "warn", name: "Asked", line: "A request you have not answered yet." },
  { block: "away", mark: "away", sev: "bad", name: "Off", line: "Approved time off. A request that spans days is one bar, with its picture on the first day." },
  { block: "away", mark: "sick", sev: "bad", name: "Sick", line: "Out sick (approved)." },
  { block: "good", mark: "away", sev: "bad", name: "Off, still scheduled", line: "Approved, but the person is still placed at a store (its code shows), so that store is short." },
  { block: "declined", mark: "declined", sev: "quiet", name: "Declined", line: "A request you turned down." },
  { block: "work", past: true, name: "Faded", line: "A day that has passed." },
];

const TONES: MarkTone[] = ["bad", "warn", "quiet"];
/** One example picture per colour of picture, from the table (the first kind of each tone). */
export function exampleOf(tone: MarkTone): MarkKind {
  const order: MarkKind[] = ["licence", "drive", "covering"];
  return order.find((k) => MARK_TONE[k] === tone)!;
}

export function KeyPanelBody({ axis }: { axis: Axis }) {
  return (
    <div className="flex flex-col gap-1.5">
      {COLOURS[axis].map((c) => (
        <div key={c.name} className="w-key-item"><Swatch block={c.block} mark={c.mark} n={c.n} past={c.past} sev={c.sev} /><span><b>{c.name}</b> <span className="text-muted">{c.line}</span></span></div>
      ))}
      <div className="mt-1 border-t border-line pt-2" />
      {TONES.map((t) => (
        <div key={t} className="w-key-item"><BlockMark kind={exampleOf(t)} tone={t} size={20} /><span><b>{TONE_TITLE[t].title} picture</b> <span className="text-muted">{TONE_TITLE[t].line}</span></span></div>
      ))}
    </div>
  );
}
