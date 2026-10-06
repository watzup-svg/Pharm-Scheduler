// History: every change set, newest first, with Undo, checkpoints and Revert.
import { useMemo, useState } from "react";
import { api, type ChangeSet } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, Chip, type ChipTone } from "../../ui/primitives.tsx";
import { plural } from "./shared.tsx";

const KIND: Record<ChangeSet["kind"], { word: string; tone: ChipTone }> = {
  manual: { word: "You", tone: "info" },
  build: { word: "Build", tone: "neutral" },
  repair: { word: "Repair", tone: "neutral" },
  improve: { word: "Improve", tone: "neutral" },
  reset: { word: "Reset", tone: "neutral" },
  undo: { word: "Undo", tone: "warning" },
  revert: { word: "Revert", tone: "warning" },
  setup: { word: "Setup", tone: "info" },
  scenario: { word: "What-if", tone: "neutral" },
};

export function History() {
  const world = useApp((s) => s.world)!;
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [cpMsg, setCpMsg] = useState<{ name: string; text: string } | null>(null);
  const [name, setName] = useState("");
  const list = world.journal.changeSets;
  const rows = useMemo(() => list.slice().reverse(), [list]);
  const undoneBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of list) if (c.kind === "undo" && c.reverses) m.set(c.reverses, c.id);
    return m;
  }, [list]);
  const seqOf = (id: string) => list.find((c) => c.id === id)?.seq;

  const undo = (c: ChangeSet) => {
    const r = api.undo(world, c.id);
    if ("refused" in r) { setMsg({ id: c.id, text: r.reason }); useApp.getState().say("error", r.reason); return; }
    setMsg(null);
    useApp.getState().undo(c.id);
  };
  const revert = (cpName: string) => {
    const r = api.revertToCheckpoint(world, cpName);
    if ("refused" in r) { setCpMsg({ name: cpName, text: r.reason }); return; }
    setCpMsg(null);
    setConfirm(null);
    useApp.getState().revert(cpName);
  };
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="px-3 py-2.5">
      <section aria-label="Checkpoints">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Checkpoints</h3>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            useApp.getState().checkpoint(n);
            setName("");
          }}
        >
          <label htmlFor="cp-name" className="sr-only">Checkpoint name</label>
          <input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Before Build" className="h-8 min-w-0 flex-1 rounded-md border border-edge bg-white px-2 text-sm" />
          <Btn type="submit" disabled={!name.trim()}>Checkpoint now</Btn>
        </form>
        {world.journal.checkpoints.length === 0 && <p className="mt-1.5 text-xs text-muted">No checkpoints yet.</p>}
        <ul className="mt-1.5 space-y-1.5">
          {world.journal.checkpoints.map((cp) => {
            const after = list.findIndex((c) => c.id === cp.afterChangeSet);
            const later = cp.afterChangeSet === "" ? list.length : after < 0 ? 0 : list.length - 1 - after;
            return (
              <li key={cp.name} className="rounded-md bg-white p-2 text-sm ring-1 ring-line">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold" title={cp.name}>{cp.name}</span>
                  <span className="shrink-0 text-xs text-muted">{later === 0 ? "No changes since" : `${plural(later, "change")} since`}</span>
                </div>
                {confirm === cp.name ? (
                  <div className="mt-1.5">
                    <p>{later === 0 ? "The schedule already matches this checkpoint." : `This undoes ${plural(later, "change set")} made after "${cp.name}" as one new step in History. You can undo it again.`}</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Btn tone="ink" onClick={() => revert(cp.name)}>Revert now</Btn>
                      <Btn tone="ghost" onClick={() => { setConfirm(null); setCpMsg(null); }}>Keep as it is</Btn>
                    </div>
                  </div>
                ) : (
                  <Btn className="mt-1.5" onClick={() => { setConfirm(cp.name); setCpMsg(null); }}>Revert to this checkpoint</Btn>
                )}
                {cpMsg?.name === cp.name && <p role="alert" className="mt-1 text-xs text-illegal">▲ {cpMsg.text}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Changes" className="mt-4">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Changes, newest first</h3>
        {rows.length === 0 && <p className="text-sm">No changes yet.</p>}
        <ul className="space-y-1.5">
          {rows.map((c) => {
            const k = KIND[c.kind];
            const undoneId = undoneBy.get(c.id);
            const engine = (c.explanation?.length ?? 0) > 0;
            return (
              <li key={c.id} className="rounded-md bg-white p-2 text-sm ring-1 ring-line" data-cs={c.id}>
                <p>{c.label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Chip tone={k.tone}>{k.word}</Chip>
                  <span className="text-xs text-muted">#{c.seq} · {plural(c.events.length, "event")}</span>
                  {undoneId && <Chip tone="neutral">Undone in #{seqOf(undoneId)}</Chip>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {!undoneId && <Btn aria-label={`${c.kind === "undo" ? "Redo" : "Undo"}: #${c.seq}`} onClick={() => undo(c)}>{c.kind === "undo" ? "Redo" : "Undo"}</Btn>}
                  {engine && <Btn tone="ghost" aria-expanded={open.has(c.id)} onClick={() => toggle(c.id)}>{open.has(c.id) ? "Hide why" : "Show why"}</Btn>}
                </div>
                {engine && open.has(c.id) && (
                  <ul className="mt-1.5 list-disc pl-4 text-xs">{c.explanation!.map((l, i) => <li key={i}>{l}</li>)}</ul>
                )}
                {msg?.id === c.id && <p role="alert" className="mt-1 text-xs text-illegal">▲ {msg.text}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
