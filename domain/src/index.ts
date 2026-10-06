// Public entry for the app. Everything the UI may import comes from here.
export * from "./dates.ts";
export * from "./types.ts";
export type { Api, BuildReport, BuildResult, CommitResult, Edit, EvalOptions, ImproveOpts, ImproveResult, Meta, PostResult, Proposal, Refusal, RepairOpts, RepairOption, RepairResult, Scenario, Session, UndoResult, World } from "./api-types.ts";
export { api, NotImplementedError } from "./api.ts";
export { evaluate, evalDelta, makeCtx, requiredFor, indexRequirements, type EvalCtx } from "./coverage.ts";
export { RULES, RULE_BY_ID, PRESENCE_RULES, type RuleDef } from "./rules.ts";
export { choicesFor, prepareChoices, judgeChoice, type Choice, type ChoiceBase } from "./choices.ts";
export { checkIntegrity, type IntegrityIssue } from "./integrity.ts";
export { applyScratch, stateHash, ENGINE_VERSION } from "./changeset.ts";
export { seedWorld, emptySession, DEFAULT_CONFIG, type Seed } from "./seed.ts";
export { importV2, type ImportReport, type DriveTable } from "./import-v2.ts";
export { expectedOn, standingMatches, patternConflicts } from "./patterns.ts";
export { sha256 } from "./hash.ts";
export { canonical, clone, deepEqual } from "./canonical.ts";
