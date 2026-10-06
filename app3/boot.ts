// Start-up: ask the save layer what it has. Never prompts; never invents data.
import { getPersist } from "./persist-bridge.ts";
import { useApp } from "./store.ts";
import { claimWindow } from "./windowLock.ts";

export async function boot(): Promise<void> {
  // A second window never touches the save layer: the first window owns the browser copy and the file.
  const side = await claimWindow(() => { getPersist().flush?.().catch(() => {}); });
  if (side !== "primary") { (window as unknown as { __bootResult?: unknown }).__bootResult = "other-window"; return; }
  const r = await getPersist().boot();
  if (r.state === "world") {
    useApp.getState().setWorld(r.world, { fileName: r.fileName ?? null, readOnlyProblems: r.readOnly?.problems ?? null });
    if (r.note) useApp.getState().say("info", r.note);
  }
  // Other states (needs-permission, recovery, refused) are shown by the Start screen from the persist status.
  (window as unknown as { __bootResult?: unknown }).__bootResult = r.state;
}
