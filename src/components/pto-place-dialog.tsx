import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { PlannedPlace } from "@/lib/schedule/stamp";

function groupPtoHits(hits: PlannedPlace[]): { name: string; days: number[] }[] {
  const byName = new Map<string, number[]>();
  for (const hit of hits) {
    const days = byName.get(hit.name) ?? [];
    if (!days.includes(hit.day)) days.push(hit.day);
    byName.set(hit.name, days);
  }
  return [...byName.entries()].map(([name, days]) => ({
    name,
    days: days.sort((a, b) => a - b),
  }));
}

export function PtoPlaceDialog({
  hits,
  onSkip,
  onPlace,
  onCancel,
}: {
  hits: PlannedPlace[];
  onSkip: () => void;
  onPlace: () => void;
  onCancel: () => void;
}) {
  const groups = groupPtoHits(hits);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent title="Time off in the way">
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-pretty text-muted">
            These days are on someone’s time off. Skip them, or schedule anyway. Scheduled time off prints in yellow and doesn’t block printing.
          </p>
          <ul className="list-disc pl-5 text-sm">
            {groups.map((g) => (
              <li key={g.name}>
                {g.name} · {g.days.join(", ")}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={onPlace}>
              Schedule anyway
            </Button>
            <Button type="button" onClick={onSkip}>
              Skip those
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
