// Binds the app to a save layer. Until persist/ lands this is an in-memory stand-in so the UI can be built and tested.
import type { PersistApi, SaveStatus } from "./persist-types.ts";

export function createMemoryPersist(): PersistApi {
  const status: SaveStatus = { backend: "none", fileName: null, linked: false, unsavedChanges: 0, lastSavedAt: null, mirrorOk: false, needsPermission: false, error: null };
  const subs = new Set<() => void>();
  const bump = () => subs.forEach((f) => f());
  const fail = { ok: false, reason: "unsupported" } as const;
  return {
    boot: async () => ({ state: "empty" }),
    recordCommit: async () => { status.unsavedChanges++; bump(); },
    adopt: async () => { status.unsavedChanges = 0; bump(); },
    open: async () => ({ state: "cancelled" }),
    save: async () => fail,
    saveAs: async () => fail,
    download: async () => fail,
    reconnect: async () => ({ state: "empty" }),
    restore: async () => ({ state: "cancelled" }),
    status: () => status,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}

let current: PersistApi = createMemoryPersist();
export const getPersist = (): PersistApi => current;
export function setPersist(p: PersistApi): void { current = p; }
