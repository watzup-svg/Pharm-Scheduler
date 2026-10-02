import { Check } from "lucide-react";
import { HexPattern } from "@/components/graphics";
import { StateMark, type MarkKind } from "@/components/marks";
import { cn } from "@/lib/utils";

export type HeroTone = "plain" | "bad" | "warn";

/** The dark shell: deep night colour, a soft glow from the top right and the hexagon texture. */
const GLOW: Record<string, string> = { away: "radial-gradient(70% 100% at 0% 100%, rgba(244,226,163,0.16) 0%, rgba(244,226,163,0) 62%), " };

export function Hero({ label, children, className, glow }: { label: string; children: React.ReactNode; className?: string; /** A warm corner glow for a page about one subject (away = yellow). */ glow?: "away" }) {
  return (
    <section
      aria-label={label}
      className={cn("relative flex flex-col overflow-hidden rounded-3xl bg-night p-4 text-white shadow-[0_18px_40px_-24px_rgba(32,24,32,0.7)] sm:p-6", className)}
      style={{ backgroundImage: `${glow ? GLOW[glow] : ""}radial-gradient(120% 140% at 100% 0%, rgba(255,255,255,0.10) 0%, rgba(32,24,32,0) 55%)` }}
    >
      <HexPattern />
      <div className="relative flex flex-1 flex-col">{children}</div>
    </section>
  );
}

/**
 * The one template every page header is built from, so they are the same size and everything sits on the same lines:
 *   lead     the big numeral (and one small extra beside it)
 *   tiles    a row of mark + count tiles
 *   actions  the buttons
 *   graphic  one picture, in a box of one fixed size
 * A row with nothing in it still keeps its place, so the header does not change height from page to page.
 */
export function HeroLayout({ label, lead, extra, tiles, tilesClassName, actions, graphic, glow }: { glow?: "away"; label: string; lead: React.ReactNode; extra?: React.ReactNode; tiles?: React.ReactNode; /** Extra classes for the tiles row, e.g. to swap the tiles for an issue title on a phone. */ tilesClassName?: string; actions?: React.ReactNode; graphic?: React.ReactNode }) {
  return (
    <Hero label={label} glow={glow} className="max-sm:min-h-[25rem]">
      <div className="grid flex-1 gap-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:gap-8">
        <div className="flex min-w-0 flex-col gap-4 sm:justify-between">
          <div className="flex min-h-[4.25rem] items-center gap-4 sm:min-h-[4.5rem] sm:gap-6">
            {lead}
            {extra}
          </div>
          <ul aria-label="Counts" className={cn("flex min-h-11 flex-wrap items-center gap-1.5 sm:gap-2", tilesClassName)}>
            {tiles}
          </ul>
          <div className="flex min-h-11 flex-wrap items-center gap-2 max-sm:[&_button]:px-3">{actions}</div>
        </div>
        <div className="relative mx-auto h-28 w-full max-w-[22rem] sm:h-56 sm:w-56 sm:max-w-none">{graphic}</div>
      </div>
    </Hero>
  );
}

/** The one icon chip: the same size and shape on every tile, coloured by what it means. */
export function HeroIcon({ tone = "plain", children, className }: { tone?: HeroTone; children: React.ReactNode; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-bold ring-1 ring-inset ring-white/20", tone === "bad" ? "bg-illegal-bg text-illegal" : tone === "warn" ? "bg-warn-bg text-warn" : "bg-white/15 text-white", className)}>
      {children}
    </span>
  );
}

const NUMERAL = "text-left text-6xl leading-none font-semibold tabular-nums sm:text-7xl";

/** The big numeral of a page. When there is nothing to count it becomes a green check. */
export function HeroLead({ n, tone = "plain", icon, mark, tip, onClick, done = false }: { n: number | string; tone?: HeroTone; icon?: React.ReactNode; /** A state mark beside the numeral, instead of a plain icon. */ mark?: MarkKind; tip: string; onClick?: () => void; done?: boolean }) {
  const aria = tip.replace(" | ", ". ");
  if (done) {
    return (
      <span data-tip={tip} role="img" aria-label={aria} className="grid size-16 shrink-0 place-items-center rounded-full bg-ok-lite text-night shadow-[0_0_28px_rgba(111,183,141,0.45)]">
        <Check aria-hidden className="size-9" />
      </span>
    );
  }
  const color = tone === "bad" ? "text-illegal-bg [text-shadow:0_0_24px_rgba(239,216,210,0.35)]" : tone === "warn" ? "text-warn-bg" : "text-white";
  const body = (
    <>
      <span className={cn(NUMERAL, color)}>{n}</span>
      {mark ? <StateMark kind={mark} size={28} tip={false} /> : icon ? <HeroIcon className="size-9 [&_svg]:size-5">{icon}</HeroIcon> : null}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} data-tip={tip} aria-label={aria} className="inline-flex items-center gap-3 rounded-xl">
      {body}
    </button>
  ) : (
    <span data-tip={tip} role="img" aria-label={aria} className="inline-flex items-center gap-3">
      {body}
    </span>
  );
}

/** A frosted tile for one mark and its count; the whole thing is the button when it has somewhere to go. */
/**
 * `current`: the kind of issue the header arrows are on. It is drawn chosen, like a chosen store chip: solid light fill
 * with dark text, so the row says which kind is being worked on by fill and contrast, not hue alone.
 */
export function HeroCount({ n, tip, children, onClick, tone = "plain", label, current }: { n: number | string; tip: string; children?: React.ReactNode; onClick?: () => void; tone?: HeroTone; label?: string; current?: boolean }) {
  const body = (
    <>
      {children}
      <span className={cn("text-xl leading-none font-semibold tabular-nums sm:text-2xl", tone === "bad" && (current ? "text-illegal" : "text-illegal-bg"), tone === "warn" && "text-warn-bg")}>{n}</span>
      {label ? <span className="text-xs text-white/65">{label}</span> : null}
    </>
  );
  const cls = cn(
    "relative inline-flex h-11 items-center gap-1.5 rounded-xl bg-white/10 px-2 ring-1 ring-white/15 transition-[opacity,box-shadow,background-color] sm:gap-2.5 sm:px-2.5",
    // Chosen the way every other choice in the app reads as chosen (store chips, the Calendars/Week/Day switch, Fix):
    // the tile turns solid light with dark text, the same inverse fill on the dark header. Fill, not hue, carries it.
    current && "bg-cream ring-0 hover:bg-cream",
  );
  return (
    <li data-current-kind={current ? "" : undefined} aria-current={current ? "true" : undefined}>
      {onClick ? (
        <button type="button" onClick={onClick} data-tip={tip} aria-label={tip.replace(" | ", ". ")} className={cn(cls, !current && "hover:bg-white/15")}>
          {body}
        </button>
      ) : (
        <span data-tip={tip} role="img" aria-label={tip.replace(" | ", ". ")} className={cls}>
          {body}
        </span>
      )}
    </li>
  );
}
