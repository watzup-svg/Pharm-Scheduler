// Start next month: two ways in, both only previews. Build opens a proposal for the whole month; "Usual patterns" puts everyone back on
// their usual days. Nothing is written until Accept in the bar at the bottom.
import { useApp } from "../../store.ts";
import { previewBuild, previewBlocker, previewPatterns } from "./actions.ts";
import { monthName, nextMonthCard } from "./lib.ts";

export function StartNextMonth({ ym, asOf, next }: { ym: string; asOf: string; next: { ym: string; bounds: { from: string; to: string }; shifts: number } }) {
  useApp((s) => s.busy); // re-render when a search starts or ends
  useApp((s) => s.world?.session.proposal);
  const card = nextMonthCard(asOf, ym, next.shifts);
  if (!card.show) return null;
  const name = monthName(next.ym);
  const why = previewBlocker();
  const bounds = next.bounds;
  return (
    <section aria-labelledby="ov-next-month" data-next-month className={card.lead ? "rounded-xl bg-night p-4 text-cream" : "rounded-xl p-4 ring-1 ring-inset ring-line"}>
      <h2 id="ov-next-month" className={card.lead ? "text-base font-semibold" : "text-sm font-semibold"}>Start {name}</h2>
      <p className={card.lead ? "mt-0.5 text-sm text-cream/75" : "mt-0.5 text-sm text-muted"}>{next.shifts === 0 ? "Nothing is placed yet." : `${next.shifts} ${next.shifts === 1 ? "shift is" : "shifts are"} placed so far.`}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!!why} title={why ?? undefined} data-tip={`Build ${name} | Fills the month from usual patterns and looks for cover | Shows a preview. Nothing is saved until you accept`}
          onClick={() => previewBuild(bounds)}
          className={card.lead ? "h-9 rounded-lg bg-white px-3 text-sm font-semibold text-ink hover:bg-cream disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white" : "h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"}>
          Build {name}
        </button>
        <button type="button" disabled={!!why} title={why ?? undefined} data-tip={`Usual patterns | Puts everyone back on their usual days at their usual store in ${name} | Shows a preview. Nothing is saved until you accept`}
          onClick={() => previewPatterns(bounds)}
          className={card.lead ? "h-9 rounded-lg px-3 text-sm font-semibold text-cream ring-1 ring-inset ring-white/30 hover:bg-white/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white" : "h-9 rounded-lg px-3 text-sm font-semibold text-ink ring-1 ring-inset ring-edge hover:bg-fill disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ink"}>
          Use usual patterns
        </button>
      </div>
    </section>
  );
}
