// Start-up: ask the save layer what it has. Never prompts; never invents data.
import { getPersist } from "./persist-bridge.ts";
import { useApp } from "./store.ts";

export async function boot(): Promise<void> {
  const r = await getPersist().boot();
  if (r.state === "world") useApp.getState().setWorld(r.world);
  // Other states (needs-permission, recovery, refused) are shown by the Start screen from the persist status.
  (window as unknown as { __bootResult?: unknown }).__bootResult = r.state;
}
