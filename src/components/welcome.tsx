import { BrandBadge } from "@/components/brand-mark";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, Store as StoreIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { monthName, suggestedMonth, todayParts } from "@/lib/schedule/calendar";
import { useScheduleStore } from "@/store/schedule-store";

export const WELCOME_KEY = "hischool-schedule-welcomed";

function markWelcomed() {
  try {
    localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Shown once, on a computer that has never opened this app, instead of dropping the person onto sample data. */
export function Welcome({ open, onClose }: { open: boolean; onClose: () => void }) {
  const startWithAllStores = useScheduleStore((s) => s.startWithAllStores);
  const loadDemo = useScheduleStore((s) => s.loadDemo);
  const openFile = useScheduleStore((s) => s.openFile);
  const navigate = useNavigate();

  function done() {
    markWelcomed();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? done() : undefined)}>
      <DialogContent sheet title="Start a schedule" description="Choose one. You can change your mind later from the File menu.">
        <div className="mb-3 flex flex-col items-start gap-1.5">
          <BrandBadge className="h-16" />
          <p className="text-sm text-muted">Month scheduler for Hi-School Pharmacy</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="h-auto min-h-14 justify-start py-2 text-left whitespace-normal"
            onClick={() => {
              const m = suggestedMonth(todayParts());
              startWithAllStores(m);
              done();
              toast.success(`${monthName(m.year, m.month)} ${m.year}: all stores are set up. Add your pharmacists next.`);
              void navigate({ to: "/people" });
            }}
          >
            <StoreIcon />
            <span>
              <span className="block font-semibold">Set up my stores</span>
              <span className="block text-xs font-normal opacity-80">Every store for {monthName(suggestedMonth(todayParts()).year, suggestedMonth(todayParts()).month)}, then add your pharmacists</span>
            </span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-auto min-h-14 justify-start py-2 text-left whitespace-normal"
            onClick={async () => {
              const result = await openFile();
              if (result === "opened") {
                done();
                toast.success("Opened schedule");
              } else if (result === "error") toast.error("Could not open that file");
            }}
          >
            <FolderOpen />
            <span>
              <span className="block font-semibold">Open a saved schedule</span>
              <span className="block text-xs font-normal opacity-80">A file you saved from this app</span>
            </span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-auto min-h-14 justify-start py-2 text-left whitespace-normal"
            onClick={() => {
              loadDemo();
              done();
              toast.success("Practice month loaded. It has planted mistakes to find and fix.");
            }}
          >
            <Sparkles />
            <span>
              <span className="block font-semibold">Try a practice month</span>
              <span className="block text-xs font-normal opacity-80">Invented pharmacists and mistakes to find</span>
            </span>
          </Button>
          <Button type="button" variant="ghost" onClick={done}>
            Not now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
