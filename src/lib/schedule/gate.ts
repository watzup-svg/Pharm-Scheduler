import { monthStatus, type MonthStatus } from "./dashboard.ts";
import type { Evaluation, ScheduleDoc } from "./types.ts";

export type PrintGate = MonthStatus & {
  /** True while a hole, a double, or a name on a closed day is left. Time off never blocks. */
  blocked: boolean;
};

/** The one answer to "can the pack print?". Print, Save PDF and the dashboard all read this. */
export function printGate(doc: ScheduleDoc, ev: Evaluation): PrintGate {
  const status = monthStatus(doc, ev);
  return { ...status, blocked: !status.ready };
}

export type PrintScope = { kind: "store"; code: string } | { kind: "person"; name: string };

/** Split the open problems into those that touch one store or one pharmacist and those that don't. */
export function scopeSteps<T extends { store: string; stores: string[]; names: string[] }>(
  steps: T[],
  scope: PrintScope,
): { own: T[]; other: T[] } {
  const own: T[] = [];
  const other: T[] = [];
  for (const step of steps) {
    const hit =
      scope.kind === "store"
        ? step.store === scope.code || step.stores.includes(scope.code)
        : step.names.includes(scope.name);
    (hit ? own : other).push(step);
  }
  return { own, other };
}
