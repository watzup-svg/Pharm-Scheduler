import {
  ArrowLeftRight,
  BadgeCheck,
  Car,
  Check,
  CircleCheck,
  Clock,
  Copy,
  DoorClosed,
  FilePenLine,
  Heart,
  House,
  LifeBuoy,
  type LucideIcon,
  Moon,
  Palmtree,
  Route,
  Phone,
  Printer,
  ShieldAlert,
  Star,
  Stethoscope,
  StickyNote,
  Thermometer,
  UserPlus,
  TriangleAlert,
  UserX,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** One place that says which picture means what. The icon guide reads this list, so it can never drift from the screens. */
export const ICON = {
  home: House,
  float: LifeBuoy,
  drive: Car,
  phone: Phone,
  note: StickyNote,
  noCoverage: UserX,
  twice: Copy,
  closed: DoorClosed,
  licence: ShieldAlert,
  licensed: BadgeCheck,
  timeOff: Palmtree,
  covering: Route,
  asis: Check,
  sick: Thermometer,
  vacation: Palmtree,
  appointment: Stethoscope,
  family: Heart,
  usualOff: Moon,
  elsewhere: ArrowLeftRight,
  relief: UserPlus,
  changed: FilePenLine,
  printed: Printer,
  bestFit: Star,
  approved: CircleCheck,
  requested: Clock,
  bench: Users,
  clean: Check,
  problem: TriangleAlert,
} as const satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICON;

/** A small icon with an accessible name. Decorative when `label` is left out. */
export function Mark({ icon, label, className, tip = true, style }: { icon: IconKey; label?: string; className?: string; tip?: boolean; style?: React.CSSProperties }) {
  const Cmp = ICON[icon];
  return label ? (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
      <Cmp className={cn("size-4", className)} style={style} />
    </span>
  ) : (
    <Cmp aria-hidden data-tip={tip ? guideTip(icon) : undefined} className={cn("size-4 shrink-0", className)} style={style} />
  );
}

/** "Name | what it means" for an icon, from the Icon guide, so every icon explains itself on hover. */
function guideTip(icon: IconKey): string | undefined {
  for (const g of ICON_GUIDE) {
    const it = g.items.find((i) => i.icon === icon);
    if (it) return `${it.name} | ${it.meaning}`;
  }
  return undefined;
}

/**
 * Where someone belongs: a little house for the store that is their home, a life buoy for a float pharmacist (who
 * is based at a store but goes where needed), then the store's name. Reads "home MOL" / "float MOL" to a screen reader.
 */
export function RoleMark({ float, store, className }: { float: boolean; store: string; className?: string }) {
  const Cmp = float ? ICON.float : ICON.home;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Cmp aria-hidden className="size-3.5 shrink-0" />
      <span aria-hidden>{store}</span>
      <span className="sr-only">{float ? `float, home ${store}` : `home ${store}`}</span>
    </span>
  );
}

/** The reason someone is out, as a picture. */
export function reasonIcon(reason: string): IconKey {
  const r = reason.toLowerCase();
  if (r.includes("sick")) return "sick";
  if (r.includes("vacation")) return "vacation";
  if (r.includes("appointment")) return "appointment";
  if (r.includes("family")) return "family";
  return "timeOff";
}

export type GuideItem = { icon: IconKey; name: string; meaning: string };

export const ICON_GUIDE: { title: string; items: GuideItem[] }[] = [
  {
    title: "People",
    items: [
      { icon: "home", name: "Home store", meaning: "The store this pharmacist usually works at." },
      { icon: "float", name: "Float pharmacist", meaning: "Based at a store, but goes wherever cover is needed. The store shown is their base." },
      { icon: "drive", name: "Drive time", meaning: "How long the drive is from their home store. Amber means 90 minutes or more." },
      { icon: "phone", name: "Call", meaning: "Tap to call or text them." },
      { icon: "licensed", name: "Licensed", meaning: "Licensed in that state." },
      { icon: "bestFit", name: "Best fit", meaning: "The suggested choice: free, close to home, and not overworked." },
      { icon: "bench", name: "Bench", meaning: "On the Stores page: licensed pharmacists from other stores within an hour’s drive who could cover. Tap to see who." },
      { icon: "relief", name: "Relief pharmacist", meaning: "Added for one day only, not on the regular roster." },
    ],
  },
  {
    title: "Problems",
    items: [
      { icon: "noCoverage", name: "No coverage", meaning: "An open store has no pharmacist. Blocks printing." },
      { icon: "twice", name: "Twice", meaning: "One pharmacist is booked at two stores the same day. Blocks printing." },
      { icon: "closed", name: "Closed", meaning: "A name is on a day the store is closed. Blocks printing." },
      { icon: "licence", name: "Licence", meaning: "Scheduled in a state they aren’t licensed in. Must be fixed." },
    ],
  },
  {
    title: "Time away",
    items: [
      { icon: "timeOff", name: "Time off", meaning: "Time off, shown as a palm tree. A name still scheduled on that day prints in yellow." },
      { icon: "sick", name: "Sick", meaning: "Called in sick." },
      { icon: "vacation", name: "Vacation", meaning: "Time off for a holiday." },
      { icon: "appointment", name: "Appointment", meaning: "Time off for an appointment." },
      { icon: "family", name: "Family", meaning: "Time off for family." },
      { icon: "usualOff", name: "Usual day off", meaning: "Their regular weekly day off. You can still schedule them after a quick confirm." },
      { icon: "elsewhere", name: "Working elsewhere", meaning: "Already scheduled at another store that day." },
      { icon: "requested", name: "Waiting", meaning: "A request you haven’t decided yet." },
      { icon: "approved", name: "Approved", meaning: "Time off you have approved." },
      { icon: "covering", name: "Covering", meaning: "Working at a store that is not their home. A reminder only; never blocks." },
      { icon: "asis", name: "Left as is", meaning: "A problem you decided to print as it is. It stays listed." },
    ],
  },
  {
    title: "Pages and posters",
    items: [
      { icon: "note", name: "Note", meaning: "This day has a note that prints on the store poster." },
      { icon: "changed", name: "Changed since printed", meaning: "This store or person changed after you last printed their page." },
      { icon: "printed", name: "Printed", meaning: "Printed or saved from this computer, with the date." },
      { icon: "clean", name: "Page is clear", meaning: "On the Print page: this store or person has no problems, so their page can print alone." },
      { icon: "problem", name: "Page has a problem", meaning: "On the Print page: fix it, or leave it as is, before printing this page." },
    ],
  },
];
