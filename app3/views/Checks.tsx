// Setup Check: lists data gaps that make the schedule less trustworthy, each with a button that jumps to the fix. It never blocks anything.
import { useMemo } from "react";
import { useApp } from "../store.ts";
import { Btn, Chip } from "../ui/primitives.tsx";
import { Title } from "./chrome/Title.tsx";
import { buildChecks, LOOKAHEAD_DAYS, type CheckItem } from "./checks/buildChecks.ts";
import { LEGEND } from "./checks/legend.ts";

const SEV: Record<CheckItem["severity"], { tone: "serious" | "warning" | "info"; mark: string; word: string }> = {
  serious: { tone: "serious", mark: "!", word: "Serious" },
  warning: { tone: "warning", mark: "▲", word: "Warning" },
  info: { tone: "info", mark: "?", word: "Note" },
};

export function Checks() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const win = useApp((s) => s.window);
  const items = useMemo(() => (world ? buildChecks(world.state, asOf, win) : []), [world, asOf, win]);
  if (!world) return null;

  const go = (it: CheckItem) => {
    const s = useApp.getState();
    s.setView(it.fix.view);
    if (it.fix.select) s.select(it.fix.select);
  };

  return (
    <div className="px-4 py-3">
      <Title tip={`Gaps in the data that make the schedule less trustworthy, looking ${LOOKAHEAD_DAYS / 7} weeks ahead from ${asOf}. | This only lists things; it never blocks you from working.`}>Setup check</Title>

      {items.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-ok" role="status">✓ Setup looks complete.</p>
      ) : (
        <>
          <p className="mt-3 text-sm font-semibold" role="status" data-testid="checks-count">{items.length} {items.length === 1 ? "thing" : "things"} to look at</p>
          <ul className="mt-1.5 divide-y divide-line rounded-md border border-line bg-cream" aria-label="Setup gaps">
            {items.map((it) => (
              <li key={it.id} data-check={it.id} className="flex items-center gap-3 px-3 py-2">
                <Chip tone={SEV[it.severity].tone} className="w-24 shrink-0 justify-center whitespace-nowrap"><span aria-hidden>{SEV[it.severity].mark}</span> {SEV[it.severity].word}</Chip>
                <span className="min-w-0 flex-1 text-sm">{it.text}</span>
                <Btn className="shrink-0" onClick={() => go(it)}>{it.fix.label}</Btn>
              </li>
            ))}
          </ul>
        </>
      )}

      <section aria-labelledby="legend-h" className="mt-8">
        <Title id="legend-h" className="text-base font-semibold" tip="Every mark comes with a word, so colour is never the only cue.">What the marks on the wall mean</Title>
        <table className="mt-2 w-full max-w-3xl border-collapse text-sm" aria-label="Wall marks">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-1 pr-3 font-semibold">Mark</th>
              <th scope="col" className="pr-3 font-semibold">Word</th>
              <th scope="col" className="font-semibold">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {LEGEND.map((l) => (
              <tr key={l.word} className="border-b border-line/60 align-top">
                <td className="py-1.5 pr-3"><span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-fill px-1 text-sm font-semibold" aria-hidden>{l.glyph}</span></td>
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold">{l.word}</th>
                <td className="py-1.5">{l.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
