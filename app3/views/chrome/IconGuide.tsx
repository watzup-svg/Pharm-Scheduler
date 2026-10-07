// The Icon guide: every colour and picture on the schedule in plain words. Built from the same tables the wall draws from
// (MARKS and MARK_TONE in ui/icons.tsx, COLOURS in wall/Key.tsx), so a new picture shows up here by itself and nothing can drift.
import * as Dialog from "@radix-ui/react-dialog";
import { BlockMark, MARKS, MARK_TONE, TONE_TITLE, type MarkKind, type MarkTone } from "../../ui/icons.tsx";
import { COLOURS, Swatch } from "../wall/Key.tsx";
import { useChrome } from "./shared.tsx";

const TONES: MarkTone[] = ["bad", "warn", "quiet"];
const kindsOf = (t: MarkTone) => (Object.keys(MARKS) as MarkKind[]).filter((k) => MARK_TONE[k] === t);

export function IconGuide() {
  const open = useChrome((s) => s.guide);
  const setGuide = useChrome((s) => s.setGuide);
  return (
    <Dialog.Root open={open} onOpenChange={setGuide}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[640px] max-w-[94vw] -translate-x-1/2 flex-col rounded-xl bg-cream p-5 shadow-xl ring-1 ring-black/10">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold">Icon guide</Dialog.Title>
            <Dialog.Close className="rounded px-2 py-1 text-sm text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">Close</Dialog.Close>
          </div>
          <p className="mt-1 text-sm text-muted">The colour of a block says whether the shift is covered. A picture on it says what still needs a look. No picture means all is well.</p>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <section aria-label="Colours">
              <h3 className="mb-1.5 text-sm font-semibold">Colours, by store</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {COLOURS.store.map((c) => <li key={c.name} className="flex items-center gap-2.5"><Swatch block={c.block} mark={c.mark} n={c.n} past={c.past} /><span><b>{c.name}</b> <span className="text-muted">{c.line}</span></span></li>)}
              </ul>
              <h3 className="mb-1.5 mt-3 text-sm font-semibold">Colours, by person</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {COLOURS.pharmacist.map((c) => <li key={c.name} className="flex items-center gap-2.5"><Swatch block={c.block} /><span><b>{c.name}</b> <span className="text-muted">{c.line}</span></span></li>)}
              </ul>
              <p className="mt-2 text-sm text-muted">A store that needs two people shows a small 1/2 until it is fully covered.</p>
            </section>
            {TONES.map((t) => (
              <section key={t} aria-label={`${TONE_TITLE[t].title} pictures`} className="mt-4">
                <h3 className="text-sm font-semibold">{TONE_TITLE[t].title} pictures</h3>
                <p className="mb-1.5 text-sm text-muted">{TONE_TITLE[t].line}</p>
                <dl className="flex flex-col gap-1.5 text-sm">
                  {kindsOf(t).map((k) => (
                    <div key={k} className="flex items-center gap-2.5">
                      <dt className="flex w-9 shrink-0 justify-center rounded-md bg-ok-lite/70 py-1"><BlockMark kind={k} tone={t} size={22} /><span className="sr-only">{MARKS[k].name}</span></dt>
                      <dd><b>{MARKS[k].name}</b> <span className="text-muted">{MARKS[k].meaning}</span></dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <p className="mt-4 text-sm text-muted">A problem you accepted shows nothing on the block. It is in the hover note and in the Inspector. Pointing at a block (or right click) lists the names and the reasons.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
