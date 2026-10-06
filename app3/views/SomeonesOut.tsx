// "Someone's out": the quick form in the right column. The full list lives on the Time off screen.
import { useState } from "react";
import { useApp } from "../store.ts";
import { Btn, Section } from "../ui/primitives.tsx";
import { plural } from "./chrome/shared.tsx";
import { OutForm } from "./timeoff/OutForm.tsx";

/** What-if notice, shown above the form while a what-if is open. */
export function WhatIfNotice() {
  const sc = useApp((s) => s.world?.session.scenario) ?? null;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!sc) return null;
  return (
    <div className="mb-2 rounded-md bg-warn-bg/60 p-2 text-sm ring-1 ring-inset ring-warn/35" role="region" aria-label="What-if">
      <p className="font-semibold">▲ {sc.parked ? "What-if parked (not saved)" : "What-if open (not saved)"}: {sc.name}</p>
      {sc.stale ? (
        <p className="mt-0.5">The live schedule changed after you parked this, so it can only be discarded.</p>
      ) : sc.parked ? (
        <p className="mt-0.5">The live schedule is open for changes again. This what-if waits, and goes stale if the live schedule changes.</p>
      ) : (
        <p className="mt-0.5">The live schedule is read-only while a what-if is open.</p>
      )}
      {confirmDiscard ? (
        <div className="mt-1.5">
          <p>Discard it? Its {plural(sc.edits.length, "edit")} are not kept anywhere else.</p>
          <div className="mt-1 flex gap-1.5">
            <Btn tone="ink" onClick={() => { useApp.getState().discardScenario(); setConfirmDiscard(false); }}>Discard what-if</Btn>
            <Btn tone="ghost" onClick={() => setConfirmDiscard(false)}>Keep it</Btn>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {!sc.parked && !sc.stale && <Btn onClick={() => useApp.getState().parkScenario()}>Park what-if and open live</Btn>}
          <Btn onClick={() => setConfirmDiscard(true)}>Discard</Btn>
        </div>
      )}
    </div>
  );
}

export function SomeonesOut({ onClose }: { compact?: boolean; onClose?: () => void } = {}) {
  const world = useApp((s) => s.world);
  if (!world) return null;
  return (
    <Section title="Someone's out" className="bg-cream">
      <WhatIfNotice />
      <Btn tone="ghost" onClick={() => onClose?.()} className="mb-2">Close</Btn>
      <OutForm />
    </Section>
  );
}
