import { cn } from "@/lib/utils";

/**
 * Days worked as one bar: the darker part is Saturdays, the lighter part is the rest. Nothing is written beside it;
 * hovering or focusing the row shows "5 Saturdays and 27 total days" (the same words are the accessible name).
 * Put it inside an element with the `group/wb` class so the note can follow the pointer to the row.
 */
export function workNote(days: number, saturdays: number, extra?: string): string {
  return `${saturdays} ${saturdays === 1 ? "Saturday" : "Saturdays"} and ${days} total ${days === 1 ? "day" : "days"}${extra ? ` · ${extra}` : ""}`;
}

export function WorkBar({ days, saturdays, max, extra, className }: { days: number; saturdays: number; max: number; extra?: string; className?: string }) {
  const note = workNote(days, saturdays, extra);
  const total = Math.max(1, max);
  const weekdays = Math.max(0, days - saturdays);
  return (
    <span className={cn("relative block", className)}>
      <span role="img" aria-label={note} data-notip className="flex h-2 overflow-hidden rounded-full bg-paper ring-1 ring-line/60">
        <span className="block h-full bg-night" style={{ width: `${(saturdays / total) * 100}%` }} />
        <span className="block h-full bg-night/40" style={{ width: `${(weekdays / total) * 100}%` }} />
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute -top-8 right-0 z-30 rounded-md bg-night px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity duration-100 group-focus-visible/wb:opacity-100 group-hover/wb:opacity-100"
      >
        {note}
      </span>
    </span>
  );
}
