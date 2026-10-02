import { monthStatus } from "./dashboard.ts";
import type { FixStep } from "./fix.ts";
import { applyNextMonthPlan, type NextMonthPlan } from "./next-month.ts";
import { evaluate } from "./rules.ts";
import type { ScheduleDoc } from "./types.ts";
import { PROBLEM_KINDS } from "./problem-kinds.ts";

export type NextMonthForecast = {
  /** Problems the new month would open with: the same count the header shows. */
  total: number;
  byKind: Record<FixStep["kind"], number>;
};

/**
 * What "Start next month" would leave on screen, worked out on a copy before anything changes. It uses the same
 * function that applies the plan and the same problem list the header counts, so the forecast and the result agree.
 */
export function forecastNextMonth(doc: ScheduleDoc, plan: NextMonthPlan): NextMonthForecast {
  const next = applyNextMonthPlan(doc, plan);
  const steps = monthStatus(next, evaluate(next)).steps;
  const byKind: NextMonthForecast["byKind"] = { hole: 0, double: 0, leftover: 0, license: 0 };
  for (const s of steps) byKind[s.kind] += 1;
  return { total: steps.length, byKind };
}

const KIND_PHRASE: Record<FixStep["kind"], [string, string]> = {
  hole: ["shift with no coverage", "shifts with no coverage"],
  double: ["person at two places", "people at two places"],
  leftover: ["name on a closed day", "names on closed days"],
  license: ["pharmacist not licensed for the store", "pharmacists not licensed for their stores"],
};

/** "November will start with 29 problems to fix: 26 shifts with no coverage and 3 people at two places." */
export function forecastLine(monthLabel: string, f: NextMonthForecast): string {
  if (!f.total) return `${monthLabel} will start with nothing to fix.`;
  const parts = PROBLEM_KINDS
    .filter((k) => f.byKind[k])
    .map((k) => `${f.byKind[k]} ${KIND_PHRASE[k][f.byKind[k] === 1 ? 0 : 1]}`);
  const list = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${monthLabel} will start with ${f.total} ${f.total === 1 ? "problem" : "problems"} to fix: ${list}.`;
}
