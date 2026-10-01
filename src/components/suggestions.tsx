import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Avatar, DriveTag } from "@/components/graphics";
import { Mark, RoleMark } from "@/components/icons";
import { driveLabel, rankCandidates, type Suggestion } from "@/lib/schedule/suggest";
import type { SlotId } from "@/lib/schedule/types";
import { useStoreTag } from "@/components/use-store-tag";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";

/**
 * The best few people who are free for an empty shift, with plain reasons. Each row has its own Schedule button, so it is
 * clear that tapping a row places that person. Ranking only: nothing here places anyone on its own.
 */
export function Suggestions({
  store,
  day,
  slot = "pharmacist",
  onPick,
  limit = 3,
  heading = null,
  exclude = [],
}: {
  store: string;
  day: number;
  slot?: SlotId;
  onPick: (s: Suggestion) => void;
  limit?: number;
  /** A small title above the rows. Leave out when the caller already has one. */
  heading?: string | null;
  /** People not to offer, such as someone just taken off this shift. */
  exclude?: string[];
}) {
  const doc = useScheduleStore((s) => s.doc);
  const tag = useStoreTag();
  const list = useMemo(() => rankCandidates(doc, store, day, slot, { exclude }).filter((s) => s.state === "free").slice(0, limit), // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, store, day, slot, limit, exclude.join("|")]);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="Free to schedule">
      {heading ? <p className="px-1 text-sm font-semibold text-ink">{heading}</p> : null}
      <ul className="flex flex-col gap-2">
        {list.map((s, i) => {
          const cautions = s.cautions.filter((c) => c !== "Long drive");
          const reasons = s.reasons.filter((r) => r !== "Free that day" && !r.includes("drive from") && r !== "Float" && !r.startsWith("Licensed")).slice(0, 2);
          return (
            <li key={s.name} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPick(s)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-white py-2.5 pr-3 pl-3 text-left ring-1 hover:bg-paper",
                  i === 0 ? "border-l-4 border-ok ring-ok/40" : "ring-line",
                )}
                aria-label={`Schedule ${s.name}. ${s.reasons.join(". ")}.${s.cautions.length ? ` Note: ${s.cautions.join(". ")}.` : ""}`}
              >
                <Avatar name={s.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold">{s.name}</span>
                    {i === 0 ? <span className="shrink-0 rounded-sm bg-ok px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase">Best fit</span> : null}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <RoleMark float={s.float} store={tag(s.home)} />
                    {s.driveMinutes != null && s.home !== store ? <DriveTag text={driveLabel(s.driveMinutes, s.driveEstimated)} long={s.driveMinutes >= 90} /> : null}
                  </span>
                  {reasons.length ? <span className="mt-0.5 block text-xs text-pretty text-muted">{reasons.join(" · ")}</span> : null}
                  {cautions.length ? <span className="mt-0.5 block text-xs font-medium text-warn">{cautions.join(" · ")}</span> : null}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-3 text-sm font-semibold",
                    i === 0 ? "bg-ink text-cream" : "bg-fill text-ink ring-1 ring-edge",
                  )}
                >
                  Schedule
                  <ChevronRight className="size-4" />
                </span>
              </button>
              {phoneOf(doc, s.name) ? (
                <a
                  href={`tel:${phoneOf(doc, s.name).replace(/[^\d+]/g, "")}`}
                  aria-label={`Call ${s.name} at ${phoneOf(doc, s.name)}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-ink ring-1 ring-line hover:bg-paper"
                >
                  <Mark icon="phone" className="size-5" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function phoneOf(doc: { people: { name: string; phone?: string }[] }, name: string): string {
  return doc.people.find((p) => p.name === name)?.phone?.trim() ?? "";
}
