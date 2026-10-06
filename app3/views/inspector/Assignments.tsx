// The people placed at this store on this day, with what is wrong (if anything) and what the DM can do about it.
import { useState } from "react";
import { RULE_BY_ID, type RuleResult } from "@domain";
import type { CellAssignment } from "../../derive.ts";
import { useApp } from "../../store.ts";
import { Chip, cx, GLYPH } from "../../ui/primitives.tsx";
import { commitEdits, codeOf, plainFail, SOURCE_WORDS, type Ctx } from "./lib.ts";
import { Act, TextField } from "./ui.tsx";

export function Assignments({ ctx, swapId, onSwap }: { ctx: Ctx; swapId: string | null; onSwap: (id: string | null) => void }) {
  const { cv } = ctx;
  if (!cv.assignments.length) return <p className="text-sm text-muted">{cv.closed ? "Nobody is placed here." : "Nobody is placed here yet."}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {cv.assignments.map((a) => (
        <li key={a.id} className="rounded-md bg-white p-2 ring-1 ring-line" aria-label={a.name}>
          <AssignmentRow ctx={ctx} a={a} swapping={swapId === a.id} onSwap={onSwap} />
        </li>
      ))}
    </ul>
  );
}

type Mode = null | "remove" | "note";

function AssignmentRow({ ctx, a, swapping, onSwap }: { ctx: Ctx; a: CellAssignment; swapping: boolean; onSwap: (id: string | null) => void }) {
  const { state, ev, lock, storeId, date } = ctx;
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState(a.partialNote ?? "");
  const results = ev.assignments[a.id]?.results ?? [];
  // Both travel rules say "Drive time not known"; say it once.
  const shown = results.filter((r, i, all) => r.verdict === "Fail" || (r.verdict === "Unknown" && all.findIndex((x) => x.verdict === "Unknown" && x.detail === r.detail) === i));
  const hasBlock = a.blocks.length > 0;
  const label = (verb: string) => `${verb} ${a.name} at ${codeOf(state, storeId)}`;

  const unpin = () => {
    if (!commitEdits([{ t: "update", assignmentId: a.id, patch: { pinned: false } }], label("Unpinned"))) return;
    if (hasBlock) useApp.getState().runRepair([{ storeId, date }], false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-sm font-semibold" title={a.name}>{a.name}</span>
        {a.agreed ? <Chip tone="ok">{GLYPH.ok} Agreed</Chip> : <Chip tone="info">Unconfirmed</Chip>}
        {a.pinned && <Chip tone="info" title="The engine will not move this person">{GLYPH.pin} Pinned</Chip>}
        {!a.counts && <Chip tone="serious" title="This person does not count toward the store's cover">! Does not count</Chip>}
        {a.counts && a.unverified && <Chip tone="neutral">{GLYPH.info} Not fully checked</Chip>}
      </div>
      <p className="text-xs text-muted">{SOURCE_WORDS[a.source]}{a.partialNote ? <> Partial day: <span className="text-ink">{a.partialNote}</span></> : null}</p>

      {shown.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {shown.map((r) => <FailureLine key={r.ruleId} ctx={ctx} a={a} r={r} />)}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Act disabled={!!lock} title={lock ?? undefined} onClick={() => setMode(mode === "remove" ? null : "remove")} pressed={mode === "remove"}>Remove</Act>
        {a.pinned
          ? <Act disabled={!!lock} title={lock ?? undefined} onClick={unpin}>{hasBlock ? "Unpin and repair" : "Unpin"}</Act>
          : <Act disabled={!!lock} title={lock ?? undefined} onClick={() => commitEdits([{ t: "update", assignmentId: a.id, patch: { pinned: true } }], label("Pinned"))}>Pin</Act>}
        <Act disabled={!!lock} title={lock ?? undefined} onClick={() => commitEdits([{ t: "update", assignmentId: a.id, patch: { agreed: !a.agreed } }], label(a.agreed ? "Marked unconfirmed:" : "Marked agreed:"))}>
          {a.agreed ? "Mark unconfirmed" : "Mark agreed"}
        </Act>
        <Act disabled={!!lock} title={lock ?? undefined} onClick={() => { setNote(a.partialNote ?? ""); setMode(mode === "note" ? null : "note"); }} pressed={mode === "note"}>
          {a.partialNote ? "Edit partial-day note" : "Add partial-day note"}
        </Act>
        <Act disabled={!!lock} title={lock ?? undefined} onClick={() => onSwap(swapping ? null : a.id)} pressed={swapping}>Swap to someone else</Act>
      </div>

      {mode === "remove" && (
        <div className="mt-2 rounded-md bg-fill p-2 text-sm" role="group" aria-label={`Remove ${a.name}`}>
          <p>Take {a.name} off {codeOf(state, storeId)} for this day? Undo is in History.</p>
          <div className="mt-1.5 flex gap-1.5">
            <Act tone="danger" disabled={!!lock} onClick={() => { if (commitEdits([{ t: "remove", assignmentId: a.id }], label("Removed"))) setMode(null); }}>Yes, remove</Act>
            <Act onClick={() => setMode(null)}>Keep</Act>
          </div>
        </div>
      )}
      {mode === "note" && (
        <div className="mt-2 rounded-md bg-fill p-2" role="group" aria-label="Partial-day note">
          <TextField
            label="Partial-day note (for example: leaves at 2pm)" value={note} onChange={setNote} autoFocus onEscape={() => setMode(null)}
            onEnter={() => { if (note.trim() && commitEdits([{ t: "update", assignmentId: a.id, patch: { partialNote: note.trim() } }], label("Noted partial day:"))) setMode(null); }}
          />
          <div className="mt-1.5 flex gap-1.5">
            <Act tone="ink" disabled={!note.trim()} onClick={() => { if (commitEdits([{ t: "update", assignmentId: a.id, patch: { partialNote: note.trim() } }], label("Noted partial day:"))) setMode(null); }}>Save note</Act>
            {a.partialNote && <Act onClick={() => { if (commitEdits([{ t: "update", assignmentId: a.id, patch: { partialNote: null } }], label("Cleared note:"))) setMode(null); }}>Clear note</Act>}
            <Act onClick={() => setMode(null)}>Cancel</Act>
          </div>
        </div>
      )}
    </div>
  );
}

/** One rule result: a failure with its fix and an Accept anyway option, an accepted failure, an outdated acceptance, or an unknown. */
function FailureLine({ ctx, a, r }: { ctx: Ctx; a: CellAssignment; r: RuleResult }) {
  const { state, lock, storeId, date } = ctx;
  const def = RULE_BY_ID[r.ruleId];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!def) return null;

  const ov = Object.values(state.overrides).find((o) => o.assignmentId === a.id && o.ruleId === r.ruleId);
  const who = a.name;

  if (r.verdict === "Unknown") {
    return (
      <li className="flex gap-1.5 text-sm">
        <Chip tone="neutral" className="shrink-0 self-start">{GLYPH.info}</Chip>
        <span>{r.detail}. Not checked, so it still counts.</span>
      </li>
    );
  }

  if (r.overridden) {
    return (
      <li className="rounded-md bg-ok-bg/50 p-1.5 text-sm">
        <div className="flex gap-1.5">
          <Chip tone="ok" className="shrink-0 self-start">{GLYPH.ok} Accepted</Chip>
          <span>{ov?.reason ? <>Accepted: {ov.reason}</> : "Accepted."} <span className="text-muted">({plainFail(state, r, a.pharmacistId, storeId, date).replace(/\.$/, "")})</span></span>
        </div>
        <div className="mt-1">
          <Act disabled={!!lock} title={lock ?? undefined} onClick={() => commitEdits([{ t: "unoverride", assignmentId: a.id, ruleId: r.ruleId }], `Removed acceptance for ${who}`)}>Remove acceptance</Act>
        </div>
      </li>
    );
  }

  // Double booking can only be accepted on the later booking; the earliest one is the anchor.
  let earliest = false;
  if (r.ruleId === "double-booking") {
    const group = Object.values(state.assignments).filter((x) => x.pharmacistId === a.pharmacistId && x.date === date).sort((x, y) => x.placedSeq - y.placedSeq || (x.id < y.id ? -1 : 1));
    earliest = group[0]?.id === a.id;
  }
  const serious = def.kind === "presence";
  const hard = !def.overridable;
  const outdated = r.outdated;
  const accept = () => {
    const edits = [...(outdated ? [{ t: "unoverride" as const, assignmentId: a.id, ruleId: r.ruleId }] : []), { t: "override" as const, assignmentId: a.id, ruleId: r.ruleId, reason: reason.trim() }];
    if (commitEdits(edits, `Accepted a problem for ${who}`)) { setOpen(false); setReason(""); }
  };
  const needReason = def.reasonRequired && !reason.trim();

  return (
    <li className={cx("rounded-md p-1.5 text-sm", serious ? "bg-illegal-bg/60" : "bg-warn-bg/60")}>
      <div className="flex gap-1.5">
        <Chip tone={serious ? "serious" : "warning"} className="shrink-0 self-start">{serious ? GLYPH.serious : GLYPH.warning}</Chip>
        <div>
          {outdated && <p className="font-medium">Accepted earlier, but this changed.</p>}
          <p>{plainFail(state, r, a.pharmacistId, storeId, date)} {def.fix}.</p>
          {hard && <p className="mt-0.5 font-medium">This cannot be accepted. It is a hard stop.</p>}
          {earliest && !hard && <p className="mt-0.5 text-muted">To accept a double booking, accept it on the later booking.</p>}
        </div>
      </div>
      {!hard && !earliest && !open && (
        <div className="mt-1 flex gap-1.5">
          <Act disabled={!!lock} title={lock ?? undefined} onClick={() => setOpen(true)}>{outdated ? "Accept again" : "Accept anyway"}</Act>
          {outdated && <Act disabled={!!lock} title={lock ?? undefined} onClick={() => commitEdits([{ t: "unoverride", assignmentId: a.id, ruleId: r.ruleId }], `Removed acceptance for ${who}`)}>Remove acceptance</Act>}
        </div>
      )}
      {open && (
        <div role="group" aria-label="Accept anyway" className="mt-1">
          <TextField
            label={def.reasonRequired ? "Why are you accepting this? (required)" : "Why are you accepting this? (optional)"} value={reason} onChange={setReason}
            autoFocus onEscape={() => setOpen(false)} onEnter={() => { if (!needReason) accept(); }}
          />
          <div className="mt-1.5 flex gap-1.5">
            <Act tone="ink" disabled={needReason || !!lock} title={needReason ? "Write a reason first" : lock ?? undefined} onClick={accept}>Accept</Act>
            <Act onClick={() => setOpen(false)}>Cancel</Act>
          </div>
        </div>
      )}
    </li>
  );
}
