// "Who can work here": everyone, ranked by the domain, each with one plain consequence line. Nothing is placed until the DM presses a button.
import { useMemo, useState } from "react";
import { applyScratch, choicesFor, type Choice, type Edit } from "@domain";
import type { CellAssignment } from "../../derive.ts";
import { shortName } from "../../names.ts";
import { Chip } from "../../ui/primitives.tsx";
import { commitEdits, codeOf, describeChoice, nameOf, type Ctx } from "./lib.ts";
import { Act } from "./ui.tsx";

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
  const choices = useMemo(() => choicesFor(base, storeId, date, asOf).filter((c) => !replace || c.pharmacistId !== replace.pharmacistId), [base, storeId, date, asOf, replace]);
  const list = all ? choices : choices.slice(0, FIRST);

  const go = (c: Choice) => {
    const store = codeOf(state, storeId);
    let edits: Edit[];
    let label: string;
    if (replace) {
      edits = c.action === "move" && c.assignmentId
        ? [{ t: "remove", assignmentId: replace.id }, { t: "move", assignmentId: c.assignmentId, toStoreId: storeId }]
        : [{ t: "swap", assignmentId: replace.id, toPharmacistId: c.pharmacistId }];
      label = `Swapped ${replace.name} for ${nameOf(state, c.pharmacistId)} at ${store}`;
    } else {
      edits = c.action === "move" && c.assignmentId ? [{ t: "move", assignmentId: c.assignmentId, toStoreId: storeId }] : [{ t: "place", storeId, pharmacistId: c.pharmacistId, date }];
      label = `${c.action === "move" ? "Moved" : "Scheduled"} ${nameOf(state, c.pharmacistId)} at ${store}`;
    }
    if (commitEdits(edits, label)) onDone();
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
        {list.map((c) => {
          const p = describeChoice(state, c, storeId, date);
          const blocked = c.blocks.length > 0;
          const hardStop = blocked && (p.hard || c.blocks.includes("licensing"));
          const verb = replace ? "Swap in" : c.action === "move" ? "Move here" : "Place";
          const name = nameOf(state, c.pharmacistId);
          return (
            <li key={c.pharmacistId} className="py-1.5" data-pharmacist={c.pharmacistId}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold" title={name}>{shortName(name, 26)}</div>
                  <div className="flex gap-1.5 text-xs">
                    <Chip tone={p.tone} className="shrink-0 self-start">{p.glyph}</Chip>
                    <span className="min-w-0">{p.text}</span>
                  </div>
                </div>
                {hardStop ? (
                  <Act disabled title={p.text} aria-label={`${verb} ${name}: not allowed. ${p.text}`}>{verb}</Act>
                ) : (
                  <Act
                    tone={blocked ? "quiet" : "ink"} disabled={!!lock} title={lock ?? (blocked ? "They would not count until you leave the problem as is" : undefined)}
                    aria-label={`${blocked ? `${verb} anyway` : verb}: ${name}`} onClick={() => go(c)} className="shrink-0"
                  >
                    {blocked ? `${verb} anyway` : verb}
                  </Act>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {choices.length > FIRST && (
        <div className="mt-1.5"><Act onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${choices.length} who could go`}</Act></div>
      )}
      {!choices.length && <p className="text-sm text-muted">Nobody else is on the list.</p>}
      {(all || choices.length <= FIRST) && footer}
    </div>
  );
}
