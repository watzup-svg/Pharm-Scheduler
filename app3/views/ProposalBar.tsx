// Bottom bar while a proposal is open. Nothing is saved until Accept is clicked. Esc discards (handled with the other shortcuts).
import { useState } from "react";
import { useApp } from "../store.ts";
import { Btn, Chip } from "../ui/primitives.tsx";
import { plural } from "./chrome/shared.tsx";

const LABEL = { build: "Build", repair: "Repair", improve: "Improve", reset: "Reset to pattern" } as const;
const SHOWN = 3;

export function ProposalBar() {
  const p = useApp((s) => s.world?.session.proposal ?? null);
  const accept = useApp((s) => s.acceptProposal);
  const discard = useApp((s) => s.discardProposal);
  const [all, setAll] = useState(false);
  if (!p) return null;
  const changes = p.edits.filter((e) => e.t === "place" || e.t === "remove" || e.t === "move" || e.t === "swap").length;
  const lines = all ? p.explanation : p.explanation.slice(0, SHOWN);
  return (
    <section aria-label="Proposal" className="shrink-0 border-t-2 border-ink bg-white px-4 py-2.5 shadow-[0_-6px_14px_-10px_rgb(28_25_23/0.4)]">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="info">{LABEL[p.kind]}</Chip>
            <h2 className="text-sm font-semibold">{p.label}: a proposal for you to look at</h2>
            <span className="text-sm">Changes {plural(changes, "assignment")}.</span>
            <span className="text-sm font-semibold">Nothing is saved until you accept.</span>
          </div>
          {p.explanation.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm" aria-label="What it does">
              {lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
          {p.explanation.length > SHOWN && (
            <button type="button" className="mt-0.5 text-xs underline" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${p.explanation.length} lines`}</button>
          )}
          <p className="mt-1 text-xs text-muted">Ghost marks on the wall show what would change. Press Esc to discard.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Btn tone="ink" onClick={() => accept()}>Accept</Btn>
          <Btn onClick={() => discard()}>Discard</Btn>
        </div>
      </div>
    </section>
  );
}
