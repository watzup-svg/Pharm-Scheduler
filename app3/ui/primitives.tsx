// Small shared pieces. Colour is state only, and never the only cue (each state also has a glyph or word).
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ink" | "quiet" | "ghost" };
export function Btn({ tone = "quiet", className, ...p }: BtnProps) {
  const t = tone === "ink" ? "bg-ink text-white hover:bg-black" : tone === "ghost" ? "text-ink hover:bg-fill" : "bg-fill text-ink hover:bg-line";
  return <button type="button" {...p} className={cx("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", t, className)} />;
}

export function Section({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("border-b border-line px-3 py-2.5", className)}>
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export type ChipTone = "serious" | "warning" | "ok" | "info" | "neutral";
const TONE: Record<ChipTone, string> = {
  serious: "bg-illegal-bg text-illegal ring-1 ring-inset ring-illegal/30",
  warning: "bg-warn-bg text-warn ring-1 ring-inset ring-warn/35",
  ok: "bg-ok-bg text-ok ring-1 ring-inset ring-ok/35",
  info: "bg-fill text-ink ring-1 ring-inset ring-edge",
  neutral: "bg-black/[0.06] text-muted ring-1 ring-inset ring-black/10",
};
export function Chip({ tone = "neutral", children, className, title }: { tone?: ChipTone; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cx("inline-flex items-center gap-1 rounded-md px-1.5 text-xs font-semibold leading-5", TONE[tone], className)}>{children}</span>;
}

/** Word marks, so state never relies on colour alone. */
export const GLYPH = { serious: "!", warning: "▲", info: "?", ok: "✓", open: "□", short: "░", pin: "◆", locum: "LOC" } as const;
