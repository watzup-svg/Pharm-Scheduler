import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export type ConfirmRequest = {
  title: string;
  /** One sentence on what is about to happen. */
  body?: string;
  /** What will be lost or changed, one short line each. */
  effects?: string[];
  confirmLabel: string;
  /** Destructive choices use the dark-red button; everything else uses the brand button. */
  tone?: "danger" | "normal";
  /** Shown as a quiet line, e.g. "You can undo this." */
  note?: string;
};

type State = { request: ConfirmRequest | null; resolve: ((ok: boolean) => void) | null };
const useConfirmStore = create<State>(() => ({ request: null, resolve: null }));

/** Ask in the app's own dialog instead of the browser's grey box. Resolves true only on the confirm button. */
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  // A second request while one is open cancels the first, so nothing is left hanging.
  useConfirmStore.getState().resolve?.(false);
  return new Promise((resolve) => useConfirmStore.setState({ request, resolve }));
}

function settle(ok: boolean) {
  const { resolve } = useConfirmStore.getState();
  useConfirmStore.setState({ request: null, resolve: null });
  resolve?.(ok);
}

/** Mounted once, in the app shell. */
export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  return (
    <Dialog open={request != null} onOpenChange={(o) => !o && settle(false)}>
      {request ? (
        <DialogContent title={request.title} description={request.body}>
          {request.effects?.length ? (
            <ul className="mb-3 flex list-disc flex-col gap-1 pl-5 text-sm text-pretty">
              {request.effects.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          {request.note ? <p className="mb-3 text-sm text-muted">{request.note}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" autoFocus onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button type="button" variant={request.tone === "danger" ? "danger" : "default"} onClick={() => settle(true)}>
              {request.confirmLabel}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
