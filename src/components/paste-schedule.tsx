import { useState } from "react";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ImportResult } from "@/lib/schedule/grid-import";
import { useScheduleStore } from "@/store/schedule-store";

/** Paste a block copied from a spreadsheet. Names go in cell by cell through the same rules as typing; nothing is overwritten. */
export function PasteScheduleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const importGrid = useScheduleStore((s) => s.importGrid);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Pick<ImportResult, "placed" | "skipped" | "problems"> | null>(null);

  function run() {
    const r = importGrid(text);
    setResult({ placed: r.placed, skipped: r.skipped, problems: r.problems });
    if (r.placed > 0) announce(`Added ${r.placed} ${r.placed === 1 ? "name" : "names"} from the paste`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setText("");
          setResult(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent
        sheet
        title="Paste a schedule"
        description="Copy cells from a spreadsheet and paste them here. The first row has the day numbers. Each row starts with the store code, then blank for the first pharmacist or “2nd” for the second."
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="rounded-lg bg-white p-3 font-mono text-xs leading-relaxed ring-1 ring-line">
            Store⇥Row⇥1⇥2⇥3…
            <br />
            EST⇥⇥Jane Smith⇥Jane Smith⇥…
            <br />
            EST⇥2nd⇥⇥⇥Susan Brown…
          </p>
          <Textarea
            aria-label="Pasted schedule"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            rows={8}
            placeholder="Paste here"
            className="font-mono text-xs"
          />
          {result ? (
            <div className="rounded-lg bg-white p-3 ring-1 ring-line" role="status">
              <p className="font-semibold">
                Added {result.placed}
                {result.skipped ? `, left ${result.skipped} that already had a name` : ""}
                {result.problems.length ? `, ${result.problems.length} couldn’t be added` : ""}.
              </p>
              {result.problems.length ? (
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-illegal">
                  {result.problems.slice(0, 20).map((p, i) => (
                    <li key={i}>{p.why}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-1 text-xs text-muted">You can undo this. Names already on the calendar are never replaced.</p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" onClick={run} disabled={!text.trim()}>
              Add the names
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
