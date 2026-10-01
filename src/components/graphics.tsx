import { Car } from "lucide-react";
import { personColorHex } from "@/lib/schedule/color";
import { cn } from "@/lib/utils";

/** A round initials badge in the person's own color. Decorative: the name is always written beside it. */
export function Avatar({ name, color, className }: { name: string; color?: string; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
  return (
    <span
      aria-hidden
      data-tip={name}
      className={cn("inline-grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white", className)}
      style={{ background: personColorHex(name, color) }}
    >
      {initials}
    </span>
  );
}

/**
 * The store's letters or number in a small hexagon, echoing the logo's shape: black text on white with one clean black outline.
 * A small dot on the corner shows whether the store needs attention (green fine, brick problem); closed stores have no dot.
 */
export function HexBadge({ code, tone = "ok", className }: { code: string; tone?: "ok" | "bad" | "muted"; className?: string }) {
  const dot = tone === "bad" ? "#8c3a2f" : tone === "ok" ? "#2f6f4e" : null;
  // Store numbers are usually four digits; letters are two or three. The text is sized to fit the hexagon either way.
  const size = code.length >= 6 ? 9.5 : code.length === 5 ? 11 : code.length === 4 ? 12.5 : 14;
  return (
    <svg viewBox="0 0 66 36" aria-hidden className={cn("h-9 w-auto shrink-0 overflow-visible", className)}>
      <path d="M15 3h36l12 15-12 15H15L3 18 15 3Z" fill="#ffffff" stroke="#201820" strokeWidth="2.6" strokeLinejoin="round" />
      <text x="33" y={18 + size * 0.36} textAnchor="middle" fontFamily="'Source Sans 3', system-ui, sans-serif" fontWeight="700" fontSize={size} fill="#201820">
        {code}
      </text>
      {dot ? <circle cx="59" cy="29" r="5.2" fill={dot} stroke="#ffffff" strokeWidth="2" /> : null}
    </svg>
  );
}



/** Drive time with a small car, for suggestions. */
export function DriveTag({ text, long }: { text: string; long?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", long ? "bg-warn-bg text-warn" : "bg-paper text-muted")}>
      <Car aria-hidden className="size-3.5" />
      {text}
    </span>
  );
}

type ArtKind = "people" | "stores" | "holidays" | "timeoff" | "week";

/** Small line drawings for empty pages, in the app's own colors. */
export function EmptyArt({ kind, className }: { kind: ArtKind; className?: string }) {
  const ink = "#201820";
  const soft = "#e6e1d8";
  const red = "#c8102e";
  return (
    <svg viewBox="0 0 120 84" aria-hidden className={cn("mx-auto h-20 w-auto", className)}>
      <rect x="6" y="66" width="108" height="4" rx="2" fill={soft} />
      {kind === "people" ? (
        <>
          <circle cx="44" cy="30" r="12" fill="none" stroke={ink} strokeWidth="3" />
          <path d="M22 66c0-14 10-22 22-22s22 8 22 22" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <circle cx="82" cy="36" r="9" fill="none" stroke={ink} strokeWidth="3" />
          <path d="M66 66c0-11 7-17 16-17s16 6 16 17" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <circle cx="98" cy="18" r="8" fill={red} />
          <path d="M98 14v8M94 18h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : null}
      {kind === "stores" ? (
        <>
          <path d="M24 66V34h72v32" fill="none" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
          <path d="M18 34l6-16h72l6 16c0 6-6 9-10.5 9S80 40 80 34c0 6-4.5 9-10 9s-10-3-10-9c0 6-4.5 9-10 9s-10-3-10-9c0 6-6 9-10.5 9S18 40 18 34Z" fill="none" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
          <rect x="50" y="48" width="20" height="18" rx="2" fill="none" stroke={ink} strokeWidth="3" />
          <path d="M82 50h8" stroke={red} strokeWidth="3" strokeLinecap="round" />
        </>
      ) : null}
      {kind === "holidays" ? (
        <>
          <rect x="26" y="20" width="68" height="46" rx="6" fill="none" stroke={ink} strokeWidth="3" />
          <path d="M26 34h68" stroke={ink} strokeWidth="3" />
          <path d="M44 14v12M76 14v12" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <path d="M50 44v16" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <path d="M50 44h20l-5 6 5 6H50" fill={red} stroke={red} strokeWidth="2" strokeLinejoin="round" />
        </>
      ) : null}
      {kind === "timeoff" ? (
        <>
          <rect x="26" y="20" width="68" height="46" rx="6" fill="none" stroke={ink} strokeWidth="3" />
          <path d="M26 34h68" stroke={ink} strokeWidth="3" />
          <path d="M44 14v12M76 14v12" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          <circle cx="60" cy="50" r="9" fill="#f2d56a" stroke={ink} strokeWidth="2.5" />
          <path d="M55.5 50l3 3 6-6.5" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {kind === "week" ? (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={20 + i * 18} y={24 + (i % 2) * 4} width="14" height={38 - (i % 2) * 4} rx="3" fill="none" stroke={ink} strokeWidth="3" />
          ))}
          <circle cx="56" cy="14" r="5" fill={red} />
        </>
      ) : null}
    </svg>
  );
}

/** The hexagon texture behind the dark page headers. Decoration only. */
export function HexPattern({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)}>
      <defs>
        <pattern id="hexes" width="56" height="48.5" patternUnits="userSpaceOnUse" patternTransform="scale(1.1)">
          <path d="M14 0h28l14 24.25L42 48.5H14L0 24.25 14 0Z" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hexes)" />
    </svg>
  );
}
