// Official artwork, never redrawn or recoloured (see app3/assets/brand/README.md). ?inline gives a data URL so it works in the single file and in PDFs.
import { cx } from "./primitives.tsx";

const files = import.meta.glob("../assets/brand/hsp-{icon,badge,badge-gray}.{png,svg,jpg}", { eager: true, query: "?inline", import: "default" }) as Record<string, string>;
const find = (stem: string) => Object.entries(files).find(([k]) => k.includes(`/${stem}.`))?.[1];

export const BADGE_DATA_URL: string | null = find("hsp-badge") ?? null;

export function BrandMark({ className, title = "Hi-School Pharmacy" }: { className?: string; title?: string }) {
  const src = find("hsp-icon") ?? find("hsp-badge");
  if (src) return <img src={src} alt={title} className={cx("h-9 w-auto", className)} />;
  return <span className={cx("font-bold", className)}>{title}</span>;
}
