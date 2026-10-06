// Save controls for the top bar, plus the dialogs the save layer needs: recovery choice, refused file, unsaved-changes guard.
// SaveDialogs is also exported so the Start screen can show boot-time recovery / refusal / reconnect before any schedule is open.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { BootResult, OpenResult, Offer, SaveStatus } from "../persist-types.ts";
import { getPersist } from "../persist-bridge.ts";
import { useApp } from "../store.ts";
import { Btn, GLYPH } from "../ui/primitives.tsx";

const NONE_STATUS: SaveStatus = { backend: "none", fileName: null, linked: false, unsavedChanges: 0, lastSavedAt: null, mirrorOk: false, needsPermission: false, error: null };

export function useSaveStatus(): SaveStatus {
  const p = getPersist();
  return useSyncExternalStore(p.subscribe, p.status, () => NONE_STATUS);
}

const timeOf = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function statusLine(s: SaveStatus, hasWorld: boolean): { text: string; tone: "ok" | "warn" | "plain" | "bad" } {
  if (s.error) return { text: `${GLYPH.warning} ${s.error}`, tone: "bad" };
  if (s.needsPermission) return { text: `${GLYPH.warning} Allow access to ${s.fileName ?? "the file"} to keep saving to it`, tone: "warn" };
  if (!hasWorld) return { text: "No schedule open", tone: "plain" };
  const n = s.unsavedChanges;
  if (s.linked) {
    if (n > 0) return { text: `${GLYPH.warning} ${plural(n, "change")} only in this browser`, tone: "warn" };
    return { text: `${GLYPH.ok} Saved to ${s.fileName} at ${timeOf(s.lastSavedAt)}`, tone: "ok" };
  }
  if (s.neverSaved) return { text: `${GLYPH.warning} Not saved to a file yet`, tone: "warn" };
  if (s.lastSavedAt) {
    if (n > 0) return { text: `${GLYPH.warning} ${plural(n, "change")} since the last download`, tone: "warn" };
    return { text: `${GLYPH.ok} Downloaded ${s.fileName ?? "a copy"} at ${timeOf(s.lastSavedAt)}`, tone: "ok" };
  }
  return { text: "Nothing to save yet", tone: "plain" };
}

type Refusal = Extract<OpenResult, { state: "refused" }> | Extract<BootResult, { state: "refused" }>;
type Dlg = { kind: "refused"; r: Refusal } | { kind: "unsaved" } | { kind: "readonly" } | null;

function applyWorld(r: Extract<OpenResult, { state: "world" }> | Extract<BootResult, { state: "world" }>) {
  useApp.getState().setWorld(r.world, { fileName: r.fileName ?? null, readOnlyProblems: r.readOnly?.problems ?? null });
}

/** Save with whatever this browser can do. */
export async function saveNow(): Promise<void> {
  const app = useApp.getState();
  const w = app.world;
  if (!w) return;
  const p = getPersist();
  const s = p.status();
  if (s.linked) {
    const r = await p.save(w);
    if (r.ok) app.say("ok", `Saved to ${p.status().fileName}.`);
    else if (r.reason === "needs-permission") app.say("info", "Choose Reconnect to allow saving to the file again.");
    else if (r.reason !== "cancelled") app.say("error", `Not saved. ${r.error ?? ""} Your previous file is unchanged.`);
    return;
  }
  if (s.backend === "fsa") {
    const r = await p.saveAs(w);
    if (r.ok) app.say("ok", `Saved to ${p.status().fileName}.`);
    else if (r.reason !== "cancelled") app.say("error", `Not saved. ${r.error ?? ""}`);
    return;
  }
  const r = await p.download(w);
  if (r.ok) app.say("info", "A copy was downloaded. This browser cannot save over the file, so each save is a new download.");
  else app.say("error", `Could not download a copy. ${r.error ?? ""}`);
}

export function SaveControls() {
  const s = useSaveStatus();
  const world = useApp((a) => a.world);
  const storeName = useApp((a) => a.fileName);
  const readOnly = useApp((a) => a.readOnlyProblems);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [busy, setBusy] = useState(false);
  const line = statusLine(s, !!world);
  const name = s.fileName ?? storeName ?? "Untitled";
  const fsa = s.backend === "fsa";

  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } finally { setBusy(false); } };
  const open = (force = false) => run(async () => {
    const r = await getPersist().open(force ? { force: true } : undefined);
    if (r.state === "world") applyWorld(r);
    else if (r.state === "unsaved-changes") setDlg({ kind: "unsaved" });
    else if (r.state === "refused") setDlg({ kind: "refused", r });
  });
  const save = () => run(saveNow);
  const saveAs = () => run(async () => {
    const w = useApp.getState().world;
    if (!w) return;
    const r = await getPersist().saveAs(w);
    if (r.ok) useApp.getState().say("ok", `Saved to ${getPersist().status().fileName}.`);
    else if (r.reason !== "cancelled") useApp.getState().say("error", `Not saved. ${r.error ?? ""}`);
  });
  const reconnect = () => run(async () => {
    const r = await getPersist().reconnect();
    if (r.state === "world" && !useApp.getState().world) applyWorld(r);
  });

  // Ctrl+S / Cmd+S saves; leaving the page with changes that are not in a file asks first.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current(); }
    };
    const leave = (e: BeforeUnloadEvent) => {
      const st = getPersist().status();
      if (useApp.getState().world && (st.unsavedChanges > 0 || st.neverSaved)) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("beforeunload", leave); };
  }, []);

  const tone = line.tone === "ok" ? "text-ok" : line.tone === "warn" ? "text-warn" : line.tone === "bad" ? "text-illegal" : "text-muted";
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Save">
      <div className="min-w-0 leading-tight">
        <div className="max-w-[220px] truncate text-sm font-semibold" title={name} data-testid="save-filename">{name}</div>
        <div className={`max-w-[320px] truncate text-xs ${tone}`} role="status" data-testid="save-status" title={line.text}>{line.text}</div>
      </div>
      <Btn data-save-open onClick={() => void open()} disabled={busy}>Open</Btn>
      <Btn tone="ink" onClick={() => void save()} disabled={busy || !world} title="Ctrl+S">{fsa || s.linked ? "Save" : "Download a copy"}</Btn>
      {fsa && <Btn onClick={() => void saveAs()} disabled={busy || !world}>Save As</Btn>}
      {s.needsPermission && <Btn tone="ink" onClick={() => void reconnect()} disabled={busy}>Reconnect</Btn>}
      {!fsa && s.backend === "download" && <span className="text-xs text-muted" title="This browser cannot save over a file. Chrome or Edge can.">Download only</span>}
      {readOnly && <Btn data-save-readonly onClick={() => setDlg({ kind: "readonly" })} className="text-warn">{GLYPH.warning} Read-only</Btn>}
      <SaveDialogs external={dlg} onClose={() => setDlg(null)} onOpenForce={() => open(true)} onSave={() => save()} />
    </div>
  );
}

function Shell({ title, children, onClose, label, returnTo }: { title: string; children: React.ReactNode; onClose?: () => void; label: string; returnTo?: string }) {
  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content aria-label={label} aria-describedby={undefined} onCloseAutoFocus={returnTo ? (e) => { const t = document.querySelector<HTMLElement>(returnTo); if (t) { e.preventDefault(); t.focus(); } } : undefined} className="fixed left-1/2 top-1/3 z-50 w-[520px] max-w-[92vw] -translate-x-1/2 rounded-lg border border-line bg-cream p-4 shadow-xl">
          <Dialog.Title className="mb-2 text-base font-semibold">{title}</Dialog.Title>
          <div className="space-y-3 text-sm">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SaveDialogs({ external = null, onClose, onOpenForce, onSave }: { external?: Dlg; onClose?: () => void; onOpenForce?: () => void; onSave?: () => void }) {
  const p = getPersist();
  useSaveStatus(); // re-render on persist changes (lastBoot is read below)
  const [dismissed, setDismissed] = useState<unknown>(null);
  const [local, setLocal] = useState<Dlg>(null);
  const readOnly = useApp((a) => a.readOnlyProblems);
  const boot = p.lastBoot?.() ?? null;

  // A file that opened at start-up read-only, or with a name: tell the store (boot.ts only passes the world).
  useEffect(() => {
    if (boot?.state === "world" && useApp.getState().world === boot.world) applyWorld(boot);
  }, [boot]);

  const dlg: Dlg = external ?? local ?? (boot && boot.state === "refused" && dismissed !== boot ? { kind: "refused", r: boot } : null);
  const close = () => { if (external) onClose?.(); else if (local) setLocal(null); else setDismissed(boot); };

  const choose = async (offer: Offer) => {
    const r = await p.restore(offer);
    if (r.state === "world") { applyWorld(r); close(); } else if (r.state === "refused") useApp.getState().say("error", r.error);
  };

  if (boot?.state === "recovery" && p.status().recoveryPending) {
    const n = boot.mirrorRev - boot.fileRev;
    const pick = async (c: "file" | "mirror") => {
      const r = await p.resolveRecovery!(c);
      if (r.state === "world") applyWorld(r);
    };
    return (
      <Shell title="Newer changes were found in this browser" label="Recovery">
        <p>The file {p.status().fileName ? <b>{p.status().fileName}</b> : "you saved"} is older than the copy this browser kept. The browser copy has {plural(n, "more change")}, probably from the last time the page closed before you saved.</p>
        <p className="text-muted">Nothing is thrown away: whichever you do not pick is set aside in this browser.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Btn onClick={() => void pick("file")}>Use the file as saved</Btn>
          <Btn tone="ink" onClick={() => void pick("mirror")}>Use the newer browser copy</Btn>
        </div>
      </Shell>
    );
  }
  if (boot?.state === "needs-permission" && p.status().needsPermission) {
    return (
      <Shell title={`Reconnect to ${boot.fileName}`} label="Reconnect" onClose={undefined}>
        <p>The browser needs your permission again before it can open <b>{boot.fileName}</b>. This is a browser rule, not a problem with the file.</p>
        <div className="flex justify-end gap-2">
          <Btn onClick={async () => { const r = await p.open({ force: true }); if (r.state === "world") applyWorld(r); }}>Open a different file</Btn>
          <Btn tone="ink" onClick={async () => { const r = await p.reconnect(); if (r.state === "world" && !useApp.getState().world) applyWorld(r); }}>Reconnect</Btn>
        </div>
      </Shell>
    );
  }
  if (!dlg) return null;
  if (dlg.kind === "unsaved") {
    return (
      <Shell title="This schedule has changes that are not in a file" label="Unsaved changes" onClose={close} returnTo="[data-save-open]">
        <p>Opening another file will replace what is on screen. Save first, or open anyway and the browser keeps a set-aside copy of this one.</p>
        <div className="flex justify-end gap-2">
          <Btn onClick={close}>Cancel</Btn>
          <Btn onClick={() => { close(); onOpenForce?.(); }}>Open anyway</Btn>
          <Btn tone="ink" onClick={async () => { close(); await onSave?.(); }}>Save first</Btn>
        </div>
      </Shell>
    );
  }
  if (dlg.kind === "readonly") {
    return (
      <Shell title="This file is open read-only" label="Read-only" onClose={close} returnTo="[data-save-readonly]">
        <p>Some of its data does not add up, so changes are turned off until it is sorted out. Nothing was repaired or changed.</p>
        <ul className="max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-muted">{(readOnly ?? []).slice(0, 30).map((x) => <li key={x}>{x}</li>)}</ul>
        <div className="flex justify-end"><Btn tone="ink" onClick={close}>Close</Btn></div>
      </Shell>
    );
  }
  const r = dlg.r;
  return (
    <Shell title="This file could not be opened" label="File refused" onClose={close} returnTo="[data-save-open]">
      <p>{r.error}</p>
      <p className="text-muted">The schedule on screen has not been touched. {r.offers.length ? "You can start from one of these instead:" : "There is no other copy to offer."}</p>
      {r.offers.length > 0 && (
        <ul className="max-h-52 space-y-1 overflow-auto">
          {r.offers.map((o) => (
            <li key={`${o.source}:${o.id}`} className="flex items-center justify-between gap-2 rounded-md border border-line px-2 py-1">
              <span className="min-w-0 truncate">{o.name}{o.at ? `, ${new Date(o.at).toLocaleString()}` : ""}</span>
              <Btn onClick={() => void choose(o)}>Use this</Btn>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted">Using one detaches it from the damaged file. Choose Save As afterwards to keep it.</p>
      <div className="flex justify-end"><Btn tone="ink" onClick={close}>Close</Btn></div>
    </Shell>
  );
}
