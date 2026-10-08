// "Who can work here": everyone, ranked by the domain, each with one plain consequence line. Nothing is placed until the DM presses a button.
import { useMemo, useState } from "react";
import { applyScratch, choicesFor, suggestionFor, type Suggestion } from "@domain";
import type { CellAssignment } from "../../derive.ts";
import { shortName } from "../../names.ts";
import { Tags } from "./Tags.tsx";
import { commitEdits, codeOf, describeChoice, describeTags, nameOf, type Ctx } from "./lib.ts";
import { OptionEffect } from "../chrome/OptionEffect.tsx";
import { Act } from "./ui.tsx";
import { HomeCode } from "../../ui/HomeCode.tsx";

const FIRST = 3;

/** `footer` renders under the full list (or under the short list when there is nothing more to show). */
export function Choices({ ctx, replace, onDone, footer }: { ctx: Ctx; replace: CellAssignment | null; onDone: () => void; footer?: React.ReactNode }) {
  const { state, asOf, lock, storeId, date } = ctx;
  const [all, setAll] = useState(false);

  // Swap mode: judge each person as if the one being replaced were already gone.
  const base = useMemo(() => {
    if (!replace) return state;
    const s = applyScratch(state, [{ t: "remove", assignmentId: replace.id }]);
    return "refused" in s ? state : s;
  }, [state, replace]);
  // Someone not licensed in this state is never suggested.
  const choices = useMemo(() => choicesFor(base, storeId, date, asOf).filter((c) => !replace || c.pharmacistId !== replace.pharmacistId).filter((c) => !c.blocks.includes("licensing")), [base, storeId, date, asOf, replace]);
  // Each person comes with the sentence, the edits and the cost, all built from the same Choice the button uses.
  // People with no side effects come first (a stable sort keeps the domain's own ranking within each group).
  const sugg = useMemo(() => choices.map((c) => suggestionFor(state, c, storeId, date, replace)).sort((a, b) => Number(b.clean) - Number(a.clean)), [choices, state, storeId, date, replace]);
  const list = all ? sugg : sugg.slice(0, FIRST);

  const go = (sg: Suggestion) => {
    const c = sg.choice;
    const store = codeOf(state, storeId);
    const label = replace ? `Swapped ${replace.name} for ${nameOf(state, c.pharmacistId)} at ${store}` : `${c.action === "move" ? "Moved" : "Scheduled"} ${nameOf(state, c.pharmacistId)} at ${store}`;
    if (commitEdits(sg.edits, label)) onDone();
  };

  return (
    <div>
      {replace && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-fill p-2 text-sm">
          <span>Swapping {replace.name}. Pick who takes the place.</span>
          <Act onClick={onDone}>Cancel swap</Act>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-line" aria-label={replace ? "Who can swap in" : "Who can work here"}>
        {list.map((sg, i) => {
          const c = sg.choice;
          const p = describeChoice(state, c, storeId, date);
          const blocked = c.blocks.length > 0;
          const hardStop = blocked && (p.hard || c.blocks.includes("licensing"));
          const verb = replace ? "Swap in" : c.action === "move" ? "Move here" : "Place";
          const name = nameOf(state, c.pharmacistId);
          const group = all ? (sg.clean ? "clean" : "cost") : null;
          const heading = group && (i === 0 || (list[i - 1]!.clean ? "clean" : "cost") !== group);
          return (
            <li key={c.pharmacistId} className="py-1.5" data-pharmacist={c.pharmacistId} data-clean={sg.clean ? "" : undefined}>
              {heading && <h3 className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{group === "clean" ? "No side effects" : "Costs something"}</h3>}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold" title={name}>{shortName(name, 26)}<HomeCode pharmacistId={c.pharmacistId} /></div>
                  <p className="mt-0.5 text-sm text-ink/80" data-sentence>{sg.detail}</p>
                  <Tags tags={describeTags(state, c, storeId, date, true)} />
                  {c.action === "move" && <OptionEffect edits={sg.edits} lead={storeId} />}
                  <span className="sr-only">{p.text}</span>
                </div>
                {hardStop ? (
                  <Act disabled title={p.text} aria-label={`${verb} ${name}: not allowed. ${p.text}`}>{verb}</Act>
                ) : (
                  <Act
                    tone={blocked ? "quiet" : "ink"} disabled={!!lock} title={lock ?? (blocked ? "They would not count until you leave the problem as is" : undefined)}
                    aria-label={`${blocked ? `${verb} anyway` : verb}: ${name}`} onClick={() => go(sg)} className="shrink-0"
                  >
                    {blocked ? `${verb} anyway` : verb}
                  </Act>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {sugg.length > FIRST && (
        <div className="mt-1.5"><Act onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${choices.length} who could go`}</Act></div>
      )}
      {!choices.length && <p className="text-sm text-muted">Nobody else is on the list.</p>}
      {(all || choices.length <= FIRST) && footer}
    </div>
  );
}
