import { cn } from "@/lib/utils";

// Official files in src/assets/brand (see the README there). ?inline gives a data URL, so they also work in the single-file build and in PDFs.
const files = import.meta.glob("/src/assets/brand/hsp-{icon,badge}.{png,svg,jpg}", { eager: true, query: "?inline", import: "default" }) as Record<string, string>;
const find = (stem: string) => Object.entries(files).find(([k]) => k.includes(`/${stem}.`))?.[1];

/** The badge as a data URL, for the PDF pack. Null when the file has not been added. */
export const BADGE_DATA_URL: string | null = find("hsp-badge") ?? null;

/**
 * The Hi-School badge for the header: the small hex icon if one has been added, otherwise the full badge. The badge is
 * artwork and is never re-typed, recolored or stretched; only its height is set.
 */
export function BrandMark({ className, title = "Hi-School Pharmacy" }: { className?: string; title?: string }) {
  const icon = find("hsp-icon");
  const badge = find("hsp-badge");
  if (icon) return <img src={icon} alt={title} className={cn("h-8 w-auto", className)} />;
  if (badge) return <img src={badge} alt={title} className={cn("h-10 w-auto", className)} />;
  return (
    <svg viewBox="0 0 64 40" role="img" aria-label={title} className={cn("h-8 w-auto", className)}>
      <path d="M14 2h36l12 18-12 18H14L2 20 14 2Z" fill="#201820" />
      <text x="32" y="26" textAnchor="middle" fontFamily="'Source Sans 3', system-ui, sans-serif" fontWeight="700" fontSize="15" fill="#e82020">
        HSP
      </text>
    </svg>
  );
}

/** The larger badge, for the welcome screen and print pages. Nothing at all when the official file is missing. */
export function BrandBadge({ className }: { className?: string }) {
  const badge = find("hsp-badge");
  return badge ? <img src={badge} alt="Hi-School pharmacy" className={cn("h-16 w-auto", className)} /> : null;
}
