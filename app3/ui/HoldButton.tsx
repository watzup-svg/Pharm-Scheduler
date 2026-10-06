// Press and hold to confirm (the old app's pattern for things that remove or replace data). Mouse or keyboard (hold Enter or Space).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./primitives.tsx";

export function HoldButton({ children, onConfirm, holdMs = 900, className, disabled, label }: { children: ReactNode; onConfirm: () => void; holdMs?: number; className?: string; disabled?: boolean; label: string }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const t0 = useRef(0);
  const fired = useRef(false);
  const stop = () => { cancelAnimationFrame(raf.current); t0.current = 0; setP(0); };
  const tick = () => {
    const f = Math.min(1, (performance.now() - t0.current) / holdMs);
    setP(f);
    if (f >= 1) { if (!fired.current) { fired.current = true; onConfirm(); } stop(); return; }
    raf.current = requestAnimationFrame(tick);
  };
  const start = () => { if (disabled || t0.current) return; fired.current = false; t0.current = performance.now(); raf.current = requestAnimationFrame(tick); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label} (press and hold)`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(); }}
      onBlur={stop}
      className={cx("relative inline-flex h-8 select-none items-center overflow-hidden rounded-md bg-fill px-3 text-sm font-medium text-ink hover:bg-line disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", className)}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 bg-illegal/25" style={{ width: `${p * 100}%` }} />
      <span className="relative">{children}</span>
    </button>
  );
}
