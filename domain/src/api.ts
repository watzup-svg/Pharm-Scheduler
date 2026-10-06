// Facade. Phase 3 replaces each stub with the real implementation, one function per commit.
import type { Api } from "./api-types.ts";
import { evaluate } from "./coverage.ts";
import { acceptProposal, discardProposal, discardScenario, openProposal, openScenario, parkScenario, scenarioEdit } from "./session.ts";
import { build, resetToPattern } from "./build.ts";
import { repair } from "./repair.ts";
import { changedSincePosting, markTold, post, toTell } from "./posting.ts";
import { checkpoint, commit, revertToCheckpoint, stateHash, undo } from "./changeset.ts";

export class NotImplementedError extends Error {
  constructor(fn: string) {
    super(`not implemented: ${fn}`);
    this.name = "NotImplementedError";
  }
}

const ni = (fn: string) => () => {
  throw new NotImplementedError(fn);
};

export const api: Api = {
  evaluate,
  commit,
  undo,
  checkpoint,
  revertToCheckpoint,
  build,
  resetToPattern,
  repair,
  improve: ni("improve"),
  openProposal,
  acceptProposal,
  discardProposal,
  openScenario,
  scenarioEdit,
  discardScenario,
  parkScenario,
  post,
  toTell,
  markTold,
  changedSincePosting,
  stateHash,
};
