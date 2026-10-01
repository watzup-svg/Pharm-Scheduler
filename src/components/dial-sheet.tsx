import { Copy, Phone } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/store/view-store";

/**
 * Phone links never navigate the page. Some browsers, and pages shown inside another app, turn a plain tel: link into a blank
 * screen. Instead a tap shows the number with Call and Copy, and Call opens in its own window so the schedule stays put.
 */
export function useDialLinks() {
  const setDial = useViewStore((s) => s.setDial);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a[href^="tel:"]');
      if (!a || a.dataset.dial) return;
      e.preventDefault();
      const label = a.getAttribute("aria-label") ?? "";
      const m = label.match(/^Call (.+?) at (.+)$/);
      const tel = (a.getAttribute("href") ?? "").slice(4);
      setDial({ who: m?.[1] ?? "", tel, display: m?.[2] ?? a.textContent?.trim() ?? tel });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [setDial]);
}

export function DialSheet() {
  const dial = useViewStore((s) => s.dial);
  const setDial = useViewStore((s) => s.setDial);
  return (
    <Dialog open={dial != null} onOpenChange={(o) => !o && setDial(null)}>
      {dial ? (
        <DialogContent sheet title={dial.who ? `Call ${dial.who}` : "Call"} description={dial.display}>
          <div className="flex flex-col gap-2">
            <a
              data-dial="1"
              href={`tel:${dial.tel}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "default" }), "w-full")}
              onClick={() => window.setTimeout(() => setDial(null), 200)}
            >
              <Phone />
              Call {dial.display}
            </a>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(dial.display).then(
                  () => toast.success("Number copied"),
                  () => toast.message(dial.display),
                );
                setDial(null);
              }}
            >
              <Copy />
              Copy number
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
