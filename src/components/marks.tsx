import { Mark, type IconKey } from "@/components/icons";
import { cn } from "@/lib/utils";
import { PROBLEM_NAME } from "@/lib/schedule/problem-kinds";

/**
 * Every state mark in the app comes from this file: one rounded-square chip, a picture inside, and a colour that says which
 * family it belongs to. The grid, the legend, the headers, the calendars and the guides all draw the same chip, so a state
 * looks the same everywhere.
 *
 *   problem  light red  - raises the count and blocks printing
 *   away     yellow     - time off and waiting requests; a warning only
 *   cover    green      - covering away from home; a warning only
 *   neutral  grey       - closed, and left as is
 */
export type MarkFamily = "problem" | "away" | "cover" | "neutral";

export type MarkKind =
  | "hole"
  | "double"
  | "leftover"
  | "license"
  | "timeOff"
  | "sick"
  | "appointment"
  | "family"
  | "waiting"
  | "covering"
  | "asis";

export const MARKS: Record<MarkKind, { family: MarkFamily; icon: IconKey; name: string; meaning: string }> = {
  hole: { family: "problem", icon: "noCoverage", name: PROBLEM_NAME.hole, meaning: "An open store with nobody scheduled" },
  double: { family: "problem", icon: "twice", name: PROBLEM_NAME.double, meaning: "The same pharmacist at two stores on one day" },
  leftover: { family: "problem", icon: "closed", name: PROBLEM_NAME.leftover, meaning: "A name left on a day the store is shut" },
  license: { family: "problem", icon: "licence", name: PROBLEM_NAME.license, meaning: "A pharmacist placed in a state they are not licensed in" },
  timeOff: { family: "away", icon: "timeOff", name: "Time off", meaning: "Scheduled on a day they are off. Prints in yellow; never blocks" },
  sick: { family: "away", icon: "sick", name: "Sick", meaning: "Called in sick" },
  appointment: { family: "away", icon: "appointment", name: "Appointment", meaning: "Time off for an appointment" },
  family: { family: "away", icon: "family", name: "Family", meaning: "Time off for family" },
  waiting: { family: "away", icon: "requested", name: "Waiting", meaning: "A request you have not decided" },
  covering: { family: "cover", icon: "covering", name: "Covering", meaning: "Working at a store that is not their home. Never blocks" },
  asis: { family: "neutral", icon: "asis", name: "Left as is", meaning: "A problem you decided to print as it is" },
};

/** The same order everywhere a list of marks is shown (legend, guides). */
export const MARK_ORDER: MarkKind[] = ["hole", "double", "leftover", "license", "timeOff", "waiting", "covering", "asis"];

/** Colours by family. These are the only places a state colour is chosen. */
const FAMILY_CLASS: Record<MarkFamily, string> = {
  problem: "bg-illegal-bg text-illegal ring-1 ring-inset ring-illegal/30",
  away: "bg-warn-bg text-warn ring-1 ring-inset ring-warn/35",
  cover: "bg-ok-bg text-ok ring-1 ring-inset ring-ok/35",
  neutral: "bg-black/[0.06] text-muted ring-1 ring-inset ring-black/10",
};

/** Four sizes only. Anything asked for snaps to the nearest one up, so marks never come in odd sizes. */
const MARK_SIZES = [16, 20, 24, 28] as const;
export type MarkSize = (typeof MARK_SIZES)[number];
const snapSize = (n: number): MarkSize => MARK_SIZES.find((s) => n <= s) ?? 28;

export function StateMark({ kind, size = 20, className, tip = true }: { kind: MarkKind; size?: number; className?: string; tip?: boolean }) {
  const def = MARKS[kind];
  const px = snapSize(size);
  const dashed = kind === "asis";
  return (
    <span
      data-statemark={kind}
      data-size={px}
      data-tip={tip ? `${def.name} | ${def.meaning}` : undefined}
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center", FAMILY_CLASS[def.family], dashed && "border border-dashed border-muted bg-paper ring-0", className)}
      style={{ width: px, height: px, borderRadius: Math.round(px * 0.28) }}
    >
      <Mark icon={def.icon} tip={false} style={{ width: Math.round(px * 0.62), height: Math.round(px * 0.62) }} />
    </span>
  );
}

/** The same colours and square shape as a mark, without the picture: for places too small to hold one (the person strip). */
export function MiniMark({ family, className }: { family: MarkFamily; className?: string }) {
  return <span data-mini={family} aria-hidden className={cn("block rounded-[3px]", FAMILY_CLASS[family], className)} />;
}

// --- The older names, kept so call sites read the same. Both draw a StateMark. -----------------------------------------

export type AlarmKind = "hole" | "double" | "leftover" | "license";

/** `onDark` is accepted and ignored: the light chip reads the same on a dark header. */
export function AlarmMark({ kind, size = 20, className, tip = true }: { kind: AlarmKind; size?: number; className?: string; tip?: boolean; onDark?: boolean }) {
  return <StateMark kind={kind} size={size} className={className} tip={tip} />;
}

const QUIET: Record<"off" | "cover" | "asis", MarkKind> = { off: "timeOff", cover: "covering", asis: "asis" };
export function QuietMark({ kind, size = 16, className }: { kind: "off" | "cover" | "asis"; size?: number; className?: string }) {
  return <StateMark kind={QUIET[kind]} size={size} className={className} tip={false} />;
}
