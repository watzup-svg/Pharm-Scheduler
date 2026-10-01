import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SHORTCUTS } from "@/components/use-shortcuts";
import { useViewStore } from "@/store/view-store";

export function ShortcutsHelp() {
  const open = useViewStore((s) => s.helpOpen);
  const setOpen = useViewStore((s) => s.setHelpOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Keyboard shortcuts" description="Click or tab to a day first. Copy and paste work between stores.">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <dt className="font-mono text-xs font-semibold whitespace-nowrap sm:py-1">{s.keys}</dt>
              <dd className="mb-2 text-muted sm:mb-0 sm:py-1">{s.does}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
