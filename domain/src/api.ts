// Facade. Phase 3 replaces each stub with the real implementation, one function per commit.
import type { Api } from "./api-types.ts";

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
  evaluate: ni("evaluate"),
  commit: ni("commit"),
  undo: ni("undo"),
  checkpoint: ni("checkpoint"),
  revertToCheckpoint: ni("revertToCheckpoint"),
  build: ni("build"),
  resetToPattern: ni("resetToPattern"),
  repair: ni("repair"),
  improve: ni("improve"),
  openProposal: ni("openProposal"),
  acceptProposal: ni("acceptProposal"),
  discardProposal: ni("discardProposal"),
  openScenario: ni("openScenario"),
  scenarioEdit: ni("scenarioEdit"),
  discardScenario: ni("discardScenario"),
  parkScenario: ni("parkScenario"),
  post: ni("post"),
  toTell: ni("toTell"),
  markTold: ni("markTold"),
  changedSincePosting: ni("changedSincePosting"),
  stateHash: ni("stateHash"),
};
