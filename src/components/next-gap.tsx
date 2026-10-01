import { HexBadge } from "@/components/graphics";
import { useStoreTag } from "@/components/use-store-tag";
import { monthName, todayParts, weekdayShort } from "@/lib/schedule/calendar";
import type { FixStep } from "@/lib/schedule/fix";
import type { ScheduleDoc } from "@/lib/schedule/types";

/**
 * The next shift with no pharmacist, as a small tear-off calendar page with the store's badge on it. No sentence:
 * the date is the page, the store is the badge, and pointing at it says the rest. Tapping it opens that day.
 */
export function NextGapLeaf({ doc, steps, onOpen, onDark = false }: { doc: ScheduleDoc; steps: FixStep[]; onOpen: (s: FixStep) => void; onDark?: boolean }) {
  const tag = useStoreTag();
  const today = todayParts();
  const inMonth = today.year === doc.year && today.month === doc.month;
  const holes = steps.filter((s) => s.kind === "hole");
  const next = (inMonth ? holes.find((s) => s.day >= today.day) : null) ?? holes[0] ?? null;
  if (!next) return null;
  const store = doc.stores.find((s) => s.code === next.store);
  const mon = monthName(doc.year, doc.month).slice(0, 3);
  const wd = weekdayShort(doc.year, doc.month, next.day);
  const delta = inMonth ? next.day - today.day : null;
  const when = delta == null ? "" : delta === 0 ? "today" : delta === 1 ? "tomorrow" : delta > 1 ? `in ${delta} days` : `${-delta} days ago`;
  const tip = [`Next gap · ${store?.name ?? next.store}`, `${wd} ${mon} ${next.day}${when ? ` · ${when}` : ""}`, holes.length > 1 ? `${holes.length - 1} more` : "The only one"].join(" | ");
  return (
    <button
      type="button"
      onClick={() => onOpen(next)}
      data-tip={tip}
      aria-label={`Next gap: ${store?.name ?? next.store}, ${wd} ${mon} ${next.day}`}
      className={"relative flex items-center gap-3 rounded-xl px-1 py-0.5 outline-offset-2 " + (onDark ? "hover:bg-white/10" : "hover:bg-paper")}
    >
      <span className="relative block w-14 shrink-0 overflow-hidden rounded-lg bg-white text-center shadow-[0_8px_18px_-8px_rgba(0,0,0,0.7)]">
        <span className="block bg-illegal text-[10px] leading-4 font-bold tracking-widest text-white">{mon.toUpperCase()}</span>
        <span className="block text-3xl leading-8 font-bold tabular-nums text-ink">{next.day}</span>
        <span className="block pb-0.5 text-[10px] leading-3 font-semibold text-muted">{wd.toUpperCase()}</span>
      </span>
      <HexBadge code={tag(next.store)} tone="bad" className="h-8" />
    </button>
  );
}
