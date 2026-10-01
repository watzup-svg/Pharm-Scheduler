import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const CENTERED =
  "fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[min(100%-1.5rem,28rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-cream p-5 text-ink shadow-[0_0_0_1px_var(--color-line),0_24px_48px_-20px_rgba(28,25,23,0.35)]";

// Bottom sheet on a phone, centered card from 640px up.
const SHEET =
  "fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-cream p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink shadow-[0_-12px_32px_-12px_rgba(28,25,23,0.4)] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[min(100%-1.5rem,34rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-5 sm:shadow-[0_0_0_1px_var(--color-line),0_24px_48px_-20px_rgba(28,25,23,0.35)]";

/** True from the laptop breakpoint up. Used to turn the day sheet into a side panel. */
export function useWide(): boolean {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

// A panel on the right that leaves the calendars usable beside it (laptop).
const DRAWER =
  "hs-slide-in fixed top-14 right-0 bottom-0 z-40 w-[26rem] overflow-y-auto overscroll-contain border-l border-line bg-cream p-5 text-ink shadow-[-12px_0_32px_-16px_rgba(28,25,23,0.3)]";

export function DialogContent({
  className,
  children,
  title,
  description,
  sheet = false,
  drawer = false,
  backdrop = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  /** One line under the title. */
  description?: string;
  /** Bottom sheet on a phone. */
  sheet?: boolean;
  /** A right-hand panel that does not block the page (use with a non-modal Dialog). */
  drawer?: boolean;
  /** Keep the dimmed backdrop behind a drawer (for forms that should hold the whole page). */
  backdrop?: boolean;
}) {
  // On a phone a bottom sheet can be pulled down to close, like the sheets people know from other apps.
  const closeRef = useRef<HTMLButtonElement>(null);
  const [drag, setDrag] = useState<{ y: number; active: boolean }>({ y: 0, active: false });
  const start = useRef(0);
  const pullable = sheet && !drawer;
  // Dialogs opened from a menu or a store flag have no trigger, so Radix has nowhere to return focus. Remember who had it.
  const [opener] = useState<Element | null>(() => (typeof document === "undefined" ? null : document.activeElement));
  return (
    <DialogPrimitive.Portal>
      {drawer && !backdrop ? null : <DialogPrimitive.Overlay className="hs-fade fixed inset-0 z-50 bg-ink/40" />}
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn("outline-none", drawer ? cn(DRAWER, backdrop && "top-0 z-[51]") : cn("hs-rise", sheet ? SHEET : CENTERED), className)}
        onInteractOutside={drawer && !backdrop ? (e) => e.preventDefault() : undefined}
        tabIndex={-1}
        onOpenAutoFocus={(e) => {
          // Start on the dialog itself, not on the Close button, so no stray focus ring shows. Fields that focus themselves keep it.
          const el = e.currentTarget as HTMLElement;
          if (el.contains(document.activeElement) && document.activeElement !== el) return;
          e.preventDefault();
          el.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(e) => {
          props.onCloseAutoFocus?.(e);
          if (e.defaultPrevented) return;
          if (opener instanceof HTMLElement && opener !== document.body && document.contains(opener)) {
            e.preventDefault();
            opener.focus({ preventScroll: true });
          }
        }}
        {...props}
        style={pullable && drag.y ? { ...props.style, transform: `translateY(${drag.y}px)`, transition: drag.active ? "none" : "transform 160ms ease-out" } : props.style}
      >
        {pullable ? (
          <div
            aria-hidden
            className="-mx-4 -mt-2 mb-1 flex h-7 touch-none items-center justify-center sm:hidden"
            onPointerDown={(e) => {
              start.current = e.clientY;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ y: 0, active: true });
            }}
            onPointerMove={(e) => {
              if (drag.active) setDrag({ y: Math.max(0, e.clientY - start.current), active: true });
            }}
            onPointerUp={() => {
              if (drag.y > 90) closeRef.current?.click();
              setDrag({ y: 0, active: false });
            }}
            onPointerCancel={() => setDrag({ y: 0, active: false })}
          >
            <span className="h-1.5 w-10 rounded-full bg-line" />
          </div>
        ) : null}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="font-display text-lg leading-tight font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            {description ? <p className="mt-0.5 text-sm text-pretty text-muted">{description}</p> : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button ref={closeRef} variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0" aria-label="Close">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
