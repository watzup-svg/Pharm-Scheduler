// One window edits a schedule at a time. Two windows saving to the same file would silently overwrite each other, so the first
// window holds a Web Lock and any later window waits behind a "Take over" choice instead of loading the schedule.
// Browsers without Web Locks (and tests that run outside a browser) behave as before: every window counts as the first.
import { useSyncExternalStore } from "react";
import { record } from "./diagnostics.ts";

export type WindowState = "primary" | "other" | "displaced";

const LOCK = "hischool-scheduler-window";
type LockApi = { request(name: string, opts: { ifAvailable?: boolean; steal?: boolean }, cb: (lock: unknown) => unknown): Promise<unknown> };
const locks = (): LockApi | null => (typeof navigator !== "undefined" ? ((navigator as unknown as { locks?: LockApi }).locks ?? null) : null);

let state: WindowState = "primary";
const subs = new Set<() => void>();
const set = (s: WindowState) => { if (s !== state) { state = s; subs.forEach((f) => f()); } };
export const windowState = (): WindowState => state;
export const isPrimaryWindow = (): boolean => state === "primary";
export const useWindowState = (): WindowState => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);

/** Hand the schedule to this window and tell the one that had it. */
const hold = (l: LockApi, opts: { ifAvailable?: boolean; steal?: boolean }, onLost: () => void): Promise<boolean> =>
  new Promise((resolve) => {
    l.request(LOCK, opts, (lock) => {
      if (!lock) { resolve(false); return undefined; }
      resolve(true);
      return new Promise<void>(() => { /* held until this page goes away */ });
    }).catch(() => onLost()); // stolen: the held request rejects with an AbortError
  });

let onDisplaced: (() => void) | null = null;

/** Called once at start-up, before the save layer is touched. Returns the state this window starts in. */
export async function claimWindow(displaced: () => void): Promise<WindowState> {
  const l = locks();
  onDisplaced = displaced;
  if (!l) return state;
  const got = await hold(l, { ifAvailable: true }, () => { record("persist", "this window lost the schedule to another window"); displaced(); set("displaced"); });
  set(got ? "primary" : "other");
  return state;
}

/** The "Take over here" button: the other window flushes its browser copy and stops; this window then reloads to pick up the latest. */
export async function takeOver(): Promise<void> {
  const l = locks();
  if (!l) return;
  const ok = await hold(l, { steal: true }, () => { onDisplaced?.(); set("displaced"); });
  if (!ok) return;
  record("persist", "took the schedule over from another window");
  // Give the other window a moment to write its browser copy before this one reads it.
  await new Promise((r) => setTimeout(r, 1500));
  location.reload();
}
