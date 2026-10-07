// The picture language of the old scheduler, carried over: one rounded-square chip, a picture inside, a colour that names the family.
// Every state also has a word wherever it is shown (colour is never the only cue). Picture choices follow src/components/icons.tsx.
import {
  Car, Check, CircleHelp, Clock, Copy, DoorClosed, Handshake, Heart, House, LifeBuoy, Moon, Palmtree, Pin, Route, ShieldAlert, Stethoscope,
  Thermometer, TriangleAlert, UserPlus, UserX, type LucideIcon,
} from "lucide-react";
import { cx } from "./primitives.tsx";

export const ICON = {
  home: House, float: LifeBuoy, drive: Car, noCoverage: UserX, twice: Copy, closed: DoorClosed, licence: ShieldAlert,
  timeOff: Palmtree, sick: Thermometer, appointment: Stethoscope, family: Heart, covering: Route, asis: Check, streak: Moon,
  unverified: CircleHelp, pinned: Pin, locum: UserPlus, waiting: Clock, agree: Handshake, warning: TriangleAlert,
} as const satisfies Record<string, LucideIcon>;
export type IconKey = keyof typeof ICON;

export function Pic({ icon, className, style }: { icon: IconKey; className?: string; style?: React.CSSProperties }) {
  const Cmp = ICON[icon];
  return <Cmp aria-hidden className={cx("size-4 shrink-0", className)} style={style} />;
}

export type MarkFamily = "problem" | "away" | "cover" | "neutral";
export type MarkKind = "open" | "closure" | "double" | "licence" | "away" | "waiting" | "drive" | "streak" | "unverified" | "short" | "covering" | "pinned" | "locum" | "unconfirmed";

/** What each state is called, drawn as, and coloured. The Setup Check legend and the wall both read this. */
export const MARKS: Record<MarkKind, { family: MarkFamily; icon: IconKey; name: string; meaning: string }> = {
  open: { family: "problem", icon: "noCoverage", name: "Needs more", meaning: "Fewer pharmacists than the store needs that day" },
  closure: { family: "problem", icon: "closed", name: "Closed", meaning: "A name is on a day the store is closed" },
  double: { family: "problem", icon: "twice", name: "Twice", meaning: "The same pharmacist at two stores on one day" },
  licence: { family: "problem", icon: "licence", name: "Licence", meaning: "Placed in a state they are not licensed in" },
  away: { family: "away", icon: "timeOff", name: "Time off", meaning: "Placed on a day they are off. They do not count" },
  drive: { family: "away", icon: "drive", name: "Long drive", meaning: "Over the drive limit from their home store. Still counts" },
  streak: { family: "away", icon: "streak", name: "Many days in a row", meaning: "Past the limit for days in a row. Still counts" },
  waiting: { family: "away", icon: "waiting", name: "Waiting", meaning: "A time-off request you have not decided" },
  unverified: { family: "neutral", icon: "unverified", name: "Cannot fully check", meaning: "A licence or drive time is not recorded. Counts, flagged" },
  short: { family: "neutral", icon: "asis", name: "Short, accepted", meaning: "You decided to run this day short" },
  covering: { family: "cover", icon: "covering", name: "Covering", meaning: "Working away from their home store. A reminder only" },
  pinned: { family: "neutral", icon: "pinned", name: "Pinned", meaning: "Held in place. The engine never moves it" },
  locum: { family: "cover", icon: "locum", name: "Locum", meaning: "An outside locum covers a shift" },
  unconfirmed: { family: "neutral", icon: "agree", name: "Not confirmed", meaning: "Placed, but the pharmacist has not agreed yet" },
};

const FAMILY: Record<MarkFamily, string> = {
  problem: "bg-illegal-bg text-illegal ring-1 ring-inset ring-illegal/30",
  away: "bg-warn-bg text-warn ring-1 ring-inset ring-warn/35",
  cover: "bg-ok-bg text-ok ring-1 ring-inset ring-ok/35",
  neutral: "bg-black/[0.06] text-muted ring-1 ring-inset ring-black/10",
};
const SIZES = [16, 20, 24, 28] as const;
const snap = (n: number) => SIZES.find((s) => n <= s) ?? 28;

/** The chip. Pass `label` to show its word beside it (queue rows, inspector); without it the chip is decorative and the cell's own name carries the meaning. */
export function StateMark({ kind, size = 20, label = false, className }: { kind: MarkKind; size?: number; label?: boolean; className?: string }) {
  const def = MARKS[kind];
  const px = snap(size);
  const chip = (
    <span data-statemark={kind} aria-hidden className={cx("inline-grid shrink-0 place-items-center", FAMILY[def.family], kind === "short" && "border border-dashed border-muted bg-paper ring-0", className)} style={{ width: px, height: px, borderRadius: Math.round(px * 0.28) }}>
      <Pic icon={def.icon} style={{ width: Math.round(px * 0.62), height: Math.round(px * 0.62) }} />
    </span>
  );
  return label ? <span className="inline-flex items-center gap-1.5">{chip}<span>{def.name}</span></span> : chip;
}

/** Which mark a rule failure gets. */
export const RULE_MARK: Record<string, MarkKind> = {
  closure: "closure", licensing: "licence", availability: "away", "double-booking": "double",
  "travel-soft": "drive", "travel-hard": "drive", "consecutive-days": "streak",
};

// ---- Block marks: the small picture on a coloured block of the schedule ----
// The block takes the colour of its picture (red / yellow / green) so a cell reads at a glance; the picture says what is wrong:
// red = a rule is broken, amber = take a look, quiet green = for information only. This table is also what the Icon guide prints.
export type MarkTone = "bad" | "warn" | "quiet";
export const MARK_TONE: Record<MarkKind, MarkTone> = {
  open: "bad", closure: "bad", double: "bad", licence: "bad", away: "bad",
  waiting: "warn", drive: "warn", streak: "warn", unverified: "warn", unconfirmed: "warn",
  short: "quiet", covering: "quiet", pinned: "quiet", locum: "quiet",
};
export const TONE_TITLE: Record<MarkTone, { title: string; line: string }> = {
  bad: { title: "Red", line: "A rule is broken, or the shift needs cover. The block is red too." },
  warn: { title: "Amber", line: "Worth a look. The shift still counts as covered. The block is yellow." },
  quiet: { title: "Quiet green", line: "For information only. Nothing to fix. The block stays green." },
};
const TONE_INK: Record<MarkTone, string> = { bad: "text-illegal", warn: "text-warn", quiet: "text-ok" };

/** The picture on a block: a small white pill with the icon in its severity colour, and a number when more than one is missing. Decorative; the cell's own name says it in words. */
export function BlockMark({ kind, tone, n, size = 20, className }: { kind: MarkKind; tone?: MarkTone; n?: number; size?: number; className?: string }) {
  const t = tone ?? MARK_TONE[kind];
  return (
    <span data-statemark={kind} data-tone={t} aria-hidden className={cx("inline-flex shrink-0 items-center justify-center gap-0.5 rounded-md bg-white px-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.14)]", TONE_INK[t], className)} style={{ height: size, minWidth: size }}>
      <Pic icon={MARKS[kind].icon} style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72) }} />
      {n !== undefined && n > 1 && <b className="pr-px text-[13px] leading-none">{n}</b>}
    </span>
  );
}
