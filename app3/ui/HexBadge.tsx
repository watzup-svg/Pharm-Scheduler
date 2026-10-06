// Store badge from the old app: black text on a white hexagon with one clean outline; a small corner dot shows status.
// Dot: green = covered, brick = needs fixing, none = closed. The dot always has an accessible word.
import { cx } from "./primitives.tsx";

export type HexStatus = "ok" | "fix" | "closed" | "none";
const DOT: Record<HexStatus, string> = { ok: "#2f6f4e", fix: "#8c3a2f", closed: "transparent", none: "transparent" };
const WORD: Record<HexStatus, string> = { ok: "covered", fix: "needs fixing", closed: "closed", none: "" };

export function HexBadge({ label, status = "none", size = 34, className }: { label: string; status?: HexStatus; size?: number; className?: string }) {
  const w = size * 1.16;
  const font = label.length > 3 ? size * 0.3 : size * 0.38;
  return (
    <span className={cx("relative inline-block shrink-0", className)} style={{ width: w, height: size }} role="img" aria-label={`${label}${WORD[status] ? `, ${WORD[status]}` : ""}`}>
      <svg viewBox="0 0 58 50" width={w} height={size} aria-hidden>
        <path d="M15 3h28l13 22-13 22H15L2 25 15 3Z" fill="#fff" stroke="#1c1c1c" strokeWidth="2.2" strokeLinejoin="round" />
        <text x="29" y="30" textAnchor="middle" fontFamily="'Source Sans 3', system-ui, sans-serif" fontWeight="700" fontSize={font * (58 / w)} fill="#1c1c1c">{label}</text>
      </svg>
      {status === "ok" || status === "fix" ? <span aria-hidden className="absolute right-0 top-0 size-[9px] rounded-full ring-2 ring-white" style={{ background: DOT[status] }} /> : null}
    </span>
  );
}
