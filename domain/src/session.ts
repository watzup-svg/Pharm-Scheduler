// Proposals and scenarios: at most one of each; live schedule read-only while either is open.
import type { CommitResult, Edit, Proposal, Refusal, World } from "./api-types.ts";
import { commitRaw, refuse, stateHash } from "./changeset.ts";
import type { DomainState } from "./types.ts";

export function openProposal(world: World, p: Proposal): World | Refusal {
  if (world.session.proposal) return refuse("A proposal is already open.");
  if (world.session.scenario && !world.session.scenario.parked) return refuse("A scenario is open. Park or discard it first.");
  if (p.stateHash !== stateHash(world.state)) return refuse("The schedule changed since this was proposed.");
  return { ...world, session: { ...world.session, proposal: p } };
}

export function acceptProposal(world: World): CommitResult {
  const p = world.session.proposal;
  if (!p) return refuse("No proposal is open.");
  if (p.stateHash !== stateHash(world.state)) return refuse("The schedule changed since this was proposed.");
  const r = commitRaw({ ...world, session: { ...world.session, proposal: null } }, [...p.edits, ...(p.builtDates ?? []).map((date) => ({ t: "built.set" as const, date }))], { kind: p.kind, label: p.label, explanation: p.explanation });
  return r;
}

export function discardProposal(world: World): World {
  return { ...world, session: { ...world.session, proposal: null } };
}

export function openScenario(world: World, name: string): World | Refusal {
  if (world.session.proposal) return refuse("A proposal is open. Accept or discard it first.");
  if (world.session.scenario) return refuse("A scenario already exists. Discard it first.");
  return { ...world, session: { ...world.session, scenario: { name, baseHash: stateHash(world.state), edits: [], parked: false, stale: false } } };
}

/** The scenario's what-if state: live state with the scenario's edits applied. */
export function scenarioState(world: World): DomainState | Refusal {
  const sc = world.session.scenario;
  if (!sc) return refuse("No scenario is open.");
  const r = commitRaw({ ...world, session: { proposal: null, scenario: null } }, sc.edits, { kind: "scenario", label: sc.name });
  return "refused" in r ? r : r.world.state;
}

export function scenarioEdit(world: World, edits: Edit[]): World | Refusal {
  const sc = world.session.scenario;
  if (!sc) return refuse("No scenario is open.");
  if (sc.stale) return refuse("This scenario is stale. Export or discard it.");
  if (sc.parked) return refuse("This scenario is parked.");
  const next = { ...sc, edits: [...sc.edits, ...edits] };
  const w = { ...world, session: { ...world.session, scenario: next } };
  const s = scenarioState(w);
  if ("refused" in s) return s;
  return w;
}

export function parkScenario(world: World): World {
  const sc = world.session.scenario;
  if (!sc) return world;
  return { ...world, session: { ...world.session, scenario: { ...sc, parked: true } } };
}

export function discardScenario(world: World): World {
  return { ...world, session: { ...world.session, scenario: null } };
}
