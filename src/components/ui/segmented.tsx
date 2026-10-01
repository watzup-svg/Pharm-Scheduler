import { cn } from "@/lib/utils";

/** A row of mutually exclusive choices. The selected one is the brand color; the rest are quiet. Every target is 44 px tall. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  tone = "ink",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  label: string;
  className?: string;
  /** Selection is ink by default; red is kept for the one action on a screen. */
  tone?: "brand" | "ink";
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold",
            value === o.value ? (tone === "ink" ? "bg-ink text-cream" : "bg-brand text-brand-fg") : "bg-fill text-ink hover:bg-shut",
          )}
        >
          {o.label}
          {o.hint ? <span className={cn("text-xs font-normal", value === o.value ? (tone === "ink" ? "text-cream" : "text-brand-fg") : "text-muted")}>{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}
