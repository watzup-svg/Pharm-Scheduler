// Small controls for the Inspector. Plain, labelled, keyboard friendly; no popups.
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cx } from "../../ui/primitives.tsx";

/** A compact button for row actions. Stays hoverable when disabled so its title (the reason) can show. */
export function Act({ children, tone = "quiet", disabled, title, pressed, className, onClick, ...p }: {
  children: ReactNode; tone?: "quiet" | "ink" | "danger"; disabled?: boolean; title?: string; pressed?: boolean; className?: string;
  onClick?: () => void; "aria-label"?: string; "data-testid"?: string;
}) {
  const t = tone === "ink" ? "bg-ink text-white hover:bg-black" : tone === "danger" ? "bg-illegal-bg text-illegal hover:bg-illegal/20" : "bg-fill text-ink hover:bg-line";
  return (
    <button
      type="button" disabled={disabled} title={title} aria-pressed={pressed} {...p} onClick={disabled ? undefined : onClick}
      className={cx("inline-flex min-h-7 items-center rounded-md px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-40", t, pressed && "ring-2 ring-ink", className)}
    >
      {children}
    </button>
  );
}

export function TextField({ label, value, onChange, onEnter, onEscape, placeholder, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; onEnter?: () => void; onEscape?: () => void; placeholder?: string; autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="mt-1">
      <label htmlFor={id} className="block text-xs text-muted">{label}</label>
      <input
        id={id} value={value} autoFocus={autoFocus} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); else if (e.key === "Escape") onEscape?.(); }}
        className="mt-0.5 h-8 w-full rounded-md border border-edge bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-ink"
      />
    </div>
  );
}

export function Stepper({ label, value, onChange, min = 0, max, disabled, title, hint }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; disabled?: boolean; title?: string; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
        <Act aria-label={`Fewer: ${label}`} disabled={disabled || value <= min} title={title} onClick={() => onChange(value - 1)} className="w-8 justify-center text-sm">−</Act>
        <span className="w-6 text-center text-sm font-semibold" aria-live="polite">{value}</span>
        <Act aria-label={`More: ${label}`} disabled={disabled || (max !== undefined && value >= max)} title={title} onClick={() => onChange(value + 1)} className="w-8 justify-center text-sm">+</Act>
      </div>
    </div>
  );
}

/** The quiet toggle used by every disclosure. */
export function DisclosureButton({ label, open, controls, onClick }: { label: string; open: boolean; controls: string; onClick: () => void }) {
  const Chev = open ? ChevronDown : ChevronRight;
  return (
    <button
      type="button" aria-expanded={open} aria-controls={controls} onClick={onClick}
      className="inline-flex min-h-7 items-center gap-1 rounded-md px-1 text-xs font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
    >
      <Chev aria-hidden className="size-3.5" />{label}
    </button>
  );
}

/** A quiet "Label" link that opens its content below. Content is not rendered while closed, so it adds no controls. */
export function Disclosure({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <DisclosureButton label={label} open={open} controls={id} onClick={() => setOpen(!open)} />
      {open && <div id={id} className="mt-1.5">{children}</div>}
    </div>
  );
}
