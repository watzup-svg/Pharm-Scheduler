import { useEffect } from "react";

const SELECTABLE = 'button[aria-pressed], [role="tab"], [role="option"], [role="menuitemradio"], [role="menuitemcheckbox"], input[type="checkbox"], input[type="radio"]';

function isSelected(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  return el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true";
}

/**
 * Makes a choice feel like a choice. When something becomes selected (a tab, a chip, a switch, a box) it gives
 * one short "pop" plus a soft ring pulse, and on a touch screen a very light tick. Nothing runs for people who ask
 * for less motion, and nothing changes what the control does.
 */
export function useSelectionFeedback() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    function onClick(e: MouseEvent) {
      if (reduced.matches) return;
      const target = e.target instanceof Element ? e.target : null;
      const el = target?.closest(SELECTABLE);
      if (!el || (el instanceof HTMLButtonElement && el.disabled)) return;
      // Wait one frame so the new selected state is on screen before it is measured.
      requestAnimationFrame(() => {
        if (!el.isConnected || !isSelected(el)) return;
        el.classList.remove("hs-select");
        void (el as HTMLElement).offsetWidth;
        el.classList.add("hs-select");
        el.addEventListener("animationend", () => el.classList.remove("hs-select"), { once: true });
        if ((e as PointerEvent).pointerType === "touch") {
          try {
            navigator.vibrate?.(6);
          } catch {
            /* no vibration here */
          }
        }
      });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}
