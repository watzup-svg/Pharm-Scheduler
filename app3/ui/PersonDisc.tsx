// A person's coloured disc: one of the eight palette colours, chosen from their id, so the same person looks the same on every screen.
import { cx } from "./primitives.tsx";

export function paletteVar(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `var(--color-p${h % 8})`;
}

export function PersonDisc({ id, size = 24, className }: { id: string; size?: number; className?: string }) {
  return <span aria-hidden="true" className={cx("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, background: paletteVar(id) }} />;
}
