import { ChevronRight } from "lucide-react";
import type { FixStep } from "@/lib/schedule/fix";
import { Mark, type IconKey } from "@/components/icons";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<FixStep["kind"], IconKey> = { hole: "noCoverage", double: "twice", leftover: "closed", license: "licence" };

export const KIND_TAG: Record<FixStep["kind"], string> = { hole: "NO COVERAGE", double: "TWICE", leftover: "CLOSED", license: "LICENSE" };

/** Each kind reads differently at a glance: no coverage and licence are solid, a double is outlined, a closed-day name is neutral. */
const TAG_STYLE: Record<FixStep["kind"], string> = {
  hole: "bg-illegal text-cream",
  license: "bg-illegal text-cream",
  double: "bg-cream text-illegal ring-1 ring-illegal",
  leftover: "bg-night text-cream",
};

/** One problem, the same on Schedule, Print and anywhere else: a kind tag, the plain sentence, and a chevron. */
export function ProblemRow({ step, onClick, big = false }: { step: FixStep; onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 text-left text-illegal bg-illegal-bg",
        big ? "min-h-14 rounded-xl px-3 py-2 lg:min-h-12" : "min-h-11 rounded-lg px-3 py-2 lg:min-h-9",
      )}
    >
      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-bold tracking-wide", TAG_STYLE[step.kind])}>
        <Mark icon={KIND_ICON[step.kind]} className="size-3.5" />
        {KIND_TAG[step.kind]}
      </span>
      <span className={cn("min-w-0 flex-1 text-sm text-pretty text-ink", big && "font-medium")}>{step.headline}</span>
      <ChevronRight aria-hidden className="size-4 shrink-0" />
    </button>
  );
}
