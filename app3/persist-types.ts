// What the app needs from the save layer. The real implementation lives in persist/ and is bound in persist-bridge.ts.
import type { ChangeSet, World } from "@domain";

export type SaveStatus = {
  backend: "fsa" | "download" | "none";
  fileName: string | null;
  /** Linked to a file the user chose (File System Access). */
  linked: boolean;
  /** Changes since the last write to the user's file. */
  unsavedChanges: number;
  lastSavedAt: string | null;
  /** Browser-side copy (IndexedDB) is current. */
  mirrorOk: boolean;
  needsPermission: boolean;
  error: string | null;
  /** Added by persist/: not linked to a file, never saved or downloaded, and there is something to lose. */
  neverSaved?: boolean;
  /** Added by persist/: a recovery choice (file or browser copy) is waiting. */
  recoveryPending?: boolean;
};

export type Offer = { source: "mirror" | "idb-ckpt" | "file-ckpt"; id?: number | string; name?: string; at?: string };

export type BootResult =
  | { state: "empty" }
  | { state: "world"; world: World; note?: string; fileName?: string; readOnly?: { problems: string[] } }
  | { state: "needs-permission"; fileName: string }
  | { state: "recovery"; fileRev: number; mirrorRev: number; world: World; mirrorWorld: World }
  | { state: "refused"; reason: string; error: string; offers: Offer[] };

export type OpenResult =
  | { state: "world"; world: World; fileName?: string; readOnly?: { problems: string[] } }
  | { state: "cancelled" }
  | { state: "unsaved-changes" }
  | { state: "refused"; reason: string; error: string; offers: Offer[] };

export type SaveResult = { ok: true; at: string; bytes: number } | { ok: false; reason: "no-handle" | "needs-permission" | "write-failed" | "cancelled" | "unsupported"; error?: string };

export interface PersistApi {
  boot(): Promise<BootResult>;
  /** Durable in the browser's own storage before this resolves. Call after every committed change set. */
  recordCommit(world: World, cs: ChangeSet): Promise<void>;
  /** Replace the browser copy with this world (after open, import, revert, new). */
  adopt(world: World, fileName?: string): Promise<void>;
  /** `force` skips the unsaved-changes guard (the user already agreed to discard). */
  open(opts?: { force?: boolean }): Promise<OpenResult>;
  save(world: World): Promise<SaveResult>;
  saveAs(world: World): Promise<SaveResult>;
  /** Fallback: hand the user a copy as a download. */
  download(world: World): Promise<SaveResult>;
  reconnect(): Promise<BootResult>;
  restore(offer: Offer): Promise<OpenResult>;
  /** Added by persist/: answer a "recovery" boot result. "file" keeps the saved file (the browser copy is set aside, not deleted). */
  resolveRecovery?(choice: "file" | "mirror"): Promise<OpenResult>;
  /** Added by persist/: the latest boot/reconnect result, so any screen can show recovery, refusal or reconnect. Cleared once resolved. */
  lastBoot?(): BootResult | null;
  status(): SaveStatus;
  subscribe(fn: () => void): () => void;
  /** Write the browser copy now (the browser persist has it; the in-memory stand-in does not). */
  flush?(): Promise<void>;
}
