// The one way to choose what you are looking at: a row of pills with the chosen one in ink. Used for Setup's sections, the request filters and the like.
// `kind="toggle"` is a group of buttons (aria-pressed); `kind="tabs"` is a real tab list (aria-selected, arrow keys, linked panels).
import type { KeyboardEvent, ReactNode } from "react";
import "../views/wall/wall.css";
import { cx } from "./primitives.tsx";

export type SegOption<T extends string> = { value: T; label: ReactNode; /** A small count shown after the label. */ count?: number; ariaLabel?: string; tip?: string };

export function Segmented<T extends string>({ options, value, onChange, label, kind = "toggle", idPrefix, className }: {
  options: SegOption<T>[]; value: T; onChange: (v: T) => void; label: string; kind?: "toggle" | "tabs"; idPrefix?: string; className?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d || kind !== "tabs") return;
    e.preventDefault();
    const next = options[(i + d + options.length) % options.length]!;
    onChange(next.value);
    document.getElementById(`${idPrefix}-tab-${next.value}`)?.focus();
  };
  return (
    <div role={kind === "tabs" ? "tablist" : "group"} aria-label={label} className={cx("w-seg", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        const common = { key: o.value, type: "button" as const, "aria-label": o.ariaLabel, "data-tip": o.tip, onClick: () => onChange(o.value) };
        return kind === "tabs" ? (
          <button {...common} id={`${idPrefix}-tab-${o.value}`} role="tab" aria-selected={on} aria-controls={`${idPrefix}-panel-${o.value}`} tabIndex={on ? 0 : -1} onKeyDown={(e) => onKey(e, i)}>
            {o.label}{o.count ? <span className="ml-1 opacity-80">{o.count}</span> : null}
          </button>
        ) : (
          <button {...common} aria-pressed={on}>{o.label}{o.count ? <span className="ml-1 opacity-80">{o.count}</span> : null}</button>
        );
      })}
    </div>
  );
}
