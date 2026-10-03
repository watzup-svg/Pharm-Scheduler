import * as React from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

/**
 * A button that has to be pressed and held before it acts. House rule: only for an action that CANNOT be undone (no Undo toast, no Ctrl+Z,
 * no Reopen). Anything undoable is a plain Button that calls announce(). Mark each use with `// no-undo: <what is lost>`; house-rules.test.ts fails otherwise.
 * While held, a fill sweeps across the button; letting go early cancels and says so.
 * Keyboard: hold Space or Enter. Assistive technology that activates the button directly (no press) acts at once, since it
 * cannot hold.
 */
export function HoldButton({
  onHold,
  holdMs = 700,
  variant,
  size,
  className,
  children,
  disabled,
  ...rest
}: Omit<React.ComponentProps<"button">, "onClick"> &
  VariantProps<typeof buttonVariants> & {
    onHold: () => void;
    /** How long to hold. Longer for actions that change many things. */
    holdMs?: number;
  }) {
  const [holding, setHolding] = React.useState(false);
  const timer = React.useRef<number | null>(null);
  const fired = React.useRef(false);
  const sawInput = React.useRef(false);

  const clear = React.useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  React.useEffect(() => clear, [clear]);

  function start() {
    if (disabled || timer.current != null) return;
    fired.current = false;
    sawInput.current = true;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      fired.current = true;
      setHolding(false);
      try {
        navigator.vibrate?.(12);
      } catch {
        /* not available */
      }
      onHold();
    }, holdMs);
  }

  function stop() {
    // The click that follows a press arrives straight after; forget the press shortly after so a later click is not mistaken for it.
    window.setTimeout(() => {
      sawInput.current = false;
    }, 400);
    if (timer.current == null) return;
    clear();
    setHolding(false);
    if (!fired.current) toast("Press and hold to confirm", { id: "hold-hint", duration: 1600 });
  }

  return (
    <button
      type="button"
      disabled={disabled}
      {...rest}
      data-holding={holding || undefined}
      className={cn(buttonVariants({ variant, size }), "relative touch-manipulation overflow-hidden select-none [-webkit-touch-callout:none]", className)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (!e.repeat) start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          stop();
        }
      }}
      onBlur={() => {
        if (timer.current != null) {
          clear();
          setHolding(false);
        }
      }}
      onClick={(e) => {
        // A press already handled the action (or cancelled it). A click with no press before it is assistive technology.
        if (sawInput.current) {
          sawInput.current = false;
          e.preventDefault();
          return;
        }
        onHold();
      }}
    >
      <span
        aria-hidden
        data-hold-fill
        className="pointer-events-none absolute inset-0 origin-left bg-current opacity-25"
        style={{ "--hold-ms": `${holdMs}ms`, transform: `scaleX(${holding ? 1 : 0})`, transition: holding ? `transform ${holdMs}ms linear` : "transform 140ms ease-out" } as React.CSSProperties}
      />
      <span className="relative inline-flex items-center justify-center gap-2">{children}</span>
      <span className="sr-only"> (press and hold)</span>
    </button>
  );
}
