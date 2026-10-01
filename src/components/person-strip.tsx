import { useMemo } from "react";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { MiniMark } from "@/components/marks";
import { monthName, weekdayShort } from "@/lib/schedule/calendar";
import { personMonths, type PersonDay } from "@/lib/schedule/insight";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";

const NAME: Record<PersonDay, string> = { none: "Not scheduled", home: "At home store", cover: "Covering another store", off: "On time off", double: "In two places" };

/** Squares in the same colours as the marks: home is dark, covering green, time off yellow, two places red. */
function Dot({ s }: { s: PersonDay }) {
  if (s === "home") return <span className="block size-1.5 rounded-[2px] bg-ink/75 sm:size-2.5" />;
  if (s === "cover") return <MiniMark family="cover" className="size-2 sm:size-2.5" />;
  if (s === "off") return <MiniMark family="away" className="size-2 sm:size-2.5" />;
  if (s === "double") return <MiniMark family="problem" className="size-2 sm:size-2.5" />;
  return <span className="block size-1 rounded-[1px] bg-black/15" />;
}

/**
 * Everyone's month on one line each, most days away first, so the top of the list is who is being used up.
 * Dark = home, green = covering, yellow = time off, red = two places. Saturdays sit on a pale band.
 */
export function PersonStrip() {
  const doc = useScheduleStore((s) => s.doc);
  const rows = useMemo(() => personMonths(doc), [doc]);
  const showOnSchedule = useShowOnSchedule();
  if (!rows.length) return null;
  const mon = monthName(doc.year, doc.month).slice(0, 3);
  return (
    <section aria-label="Each pharmacist's month" className="surface p-3">
      <p aria-hidden className="mb-1 grid grid-cols-[6.5rem_1fr_2rem_2rem] gap-2 text-[10px] font-semibold tracking-wide text-muted uppercase sm:grid-cols-[9rem_1fr_2rem_2rem]">
        <span />
        <span />
        <span className="text-right" data-tip="Days away from their home store">Away</span>
        <span className="text-right" data-tip="Saturdays worked">Sat</span>
      </p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li
            key={r.name}
            className="grid grid-cols-[6.5rem_1fr_2rem_2rem] items-center gap-2 sm:grid-cols-[9rem_1fr_2rem_2rem]"
          >
            <span data-tip={`${r.name} | ${r.worked} days scheduled, ${r.away} away from home${r.saturdays ? `, ${r.saturdays} ${r.saturdays === 1 ? "Saturday" : "Saturdays"}` : ""}${r.days.includes("off") ? `, ${r.days.filter((x) => x === "off").length} on time off` : ""}${r.days.includes("double") ? " | In two places on a day" : ""}`} className="min-w-0 text-xs font-semibold break-words">{r.name}</span>
            <span role="group" aria-label={`${r.name}: ${r.worked} days scheduled, ${r.away} away`} className="grid items-center" style={{ gridTemplateColumns: `repeat(${r.days.length}, minmax(0, 1fr))` }}>
              {r.days.map((s, i) => {
                const tip = `${r.name} · ${weekdayShort(doc.year, doc.month, i + 1)} ${mon} ${i + 1} | ${NAME[s]}`;
                const cls = cn("grid h-5 place-items-center", r.sat[i] && "bg-black/[0.06]");
                const store = r.at[i];
                // A day they are working opens that day; a day off or empty has nothing to open.
                return store ? (
                  <button key={i} type="button" data-tip={tip} aria-label={tip.replace(" | ", ". ")} onClick={() => showOnSchedule({ store, slot: "pharmacist", day: i + 1 }, true)} className={cn(cls, "outline-none hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ink")}>
                    <Dot s={s} />
                  </button>
                ) : (
                  <span key={i} data-tip={tip} className={cls}>
                    <Dot s={s} />
                  </span>
                );
              })}
            </span>
            <span data-tip={`${r.away} ${r.away === 1 ? "day" : "days"} away from home`} className="text-right text-xs font-semibold tabular-nums text-muted">{r.away || ""}</span>
            <span data-tip={`${r.saturdays} ${r.saturdays === 1 ? "Saturday" : "Saturdays"}`} className="text-right text-xs font-semibold tabular-nums text-muted">{r.saturdays || ""}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
