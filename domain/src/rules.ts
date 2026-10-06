// The one rule registry. Logic lives in coverage.ts; this table says what each rule is.
import type { RuleId, RuleKind } from "./types.ts";

export type RuleDef = {
  id: RuleId;
  kind: RuleKind;
  severity: "serious" | "warning";
  overridable: boolean;
  reasonRequired: boolean;
  suggestible: boolean;
  /** Bump when the rule's logic changes; feeds the content-addressed rule hash. */
  version: number;
  message: string;
  fix: string;
};

export const RULES: readonly RuleDef[] = [
  { id: "availability", kind: "presence", severity: "serious", overridable: true, reasonRequired: true, suggestible: false, version: 1, message: "Not available that day", fix: "Pick someone who is available, or cover another way" },
  { id: "closure", kind: "presence", severity: "serious", overridable: true, reasonRequired: true, suggestible: false, version: 1, message: "Store is closed that day", fix: "Remove the assignment or change the closure" },
  { id: "consecutive-days", kind: "policy", severity: "warning", overridable: true, reasonRequired: false, suggestible: true, version: 1, message: "Too many days in a row", fix: "Give them a day off or accept it" },
  { id: "double-booking", kind: "presence", severity: "serious", overridable: true, reasonRequired: true, suggestible: false, version: 1, message: "Booked at two stores the same day", fix: "Keep one store" },
  { id: "licensing", kind: "presence", severity: "serious", overridable: false, reasonRequired: true, suggestible: false, version: 1, message: "Not licensed in this state", fix: "Pick a licensed pharmacist" },
  { id: "travel-hard", kind: "policy", severity: "warning", overridable: true, reasonRequired: false, suggestible: true, version: 1, message: "Drive is over the hard limit", fix: "Pick someone closer or accept it" },
  { id: "travel-soft", kind: "policy", severity: "warning", overridable: true, reasonRequired: false, suggestible: true, version: 1, message: "Drive is long", fix: "Pick someone closer or accept it" },
];

export const RULE_BY_ID: Readonly<Record<string, RuleDef>> = Object.fromEntries(RULES.map((r) => [r.id, r]));

export const PRESENCE_RULES: readonly RuleId[] = RULES.filter((r) => r.kind === "presence").map((r) => r.id);
