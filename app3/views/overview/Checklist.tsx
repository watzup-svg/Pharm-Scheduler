// The month checklist: six things to be true before the month is done. Each ticks itself from the schedule and links to where it is fixed.
// A hexagon for each step (the old build's path), the first one still to do is drawn in ink.
import { cx } from "../../ui/primitives.tsx";
import { goWhere } from "./actions.ts";
import type { ChecklistItem, Where } from "./lib.ts";

const VERB: Record<Where["to"], string> = { setup: "Check", timeoff: "Review", problem: "Show", print: "Post", tell: "Tell", save: "Save" };

function Hex({ done, current, n }: { done: boolean; current: boolean; n: number }) {
  return (
    <span aria-hidden className="relative grid size-8 shrink-0 place-items-center">
      <svg viewBox="0 0 56 48" className="absolute inset-0 size-full">
        <polygon points="14,2 42,2 54,24 42,46 14,46 2,24" strokeWidth={current ? 4 : 2.5} strokeLinejoin="round" className={cx(done ? "fill-ok-lite stroke-ok-lite" : "fill-cream", !done && (current ? "stroke-ink" : "stroke-edge"))} />
      </svg>
      <span className={cx("relative text-xs font-bold", done ? "text-night" : "text-muted")}>{done ? "✓" : n}</span>
    </span>
  );
}

export function Checklist({ items }: { items: ChecklistItem[] }) {
  const next = items.findIndex((i) => !i.done);
  return (
    <section aria-labelledby="ov-list">
      <div className="flex items-baseline justify-between">
        <h2 id="ov-list" className="text-xs font-semibold uppercase tracking-wide text-muted">This month</h2>
      </div>
      <ol className="mt-2 divide-y divide-line/60" aria-label="Month checklist" data-checklist>
        {items.map((it, i) => (
          <li key={it.id} data-item={it.id} data-done={it.done ? "true" : "false"} className="flex items-center gap-3 py-2">
            <Hex done={it.done} current={i === next} n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className={cx("text-sm", it.done ? "text-muted" : "font-medium")}><span className="sr-only">{it.done ? "Done: " : "To do: "}</span>{it.label}</p>
              <p className={cx("text-xs", it.done ? "text-muted" : "text-muted")}>{it.detail}</p>
            </div>
            {!it.done && <button type="button" onClick={() => goWhere(it.where)} aria-label={`${VERB[it.where.to]}: ${it.label}`} className="h-8 shrink-0 rounded-md px-3 text-sm font-medium text-ink ring-1 ring-inset ring-edge hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">{VERB[it.where.to]}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}
