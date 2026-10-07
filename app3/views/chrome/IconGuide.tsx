// The Icon guide: every colour and picture on the schedule in plain words. Built from the same tables the wall draws from
// (MARKS and MARK_TONE in ui/icons.tsx, COLOURS in wall/Key.tsx), so a new picture shows up here by itself and nothing can drift.
import * as Dialog from "@radix-ui/react-dialog";
import { BlockMark, MARKS, MARK_TONE, TIMEOFF_MARKS, TONE_TITLE, type MarkKind, type MarkTone } from "../../ui/icons.tsx";
import { COLOURS, Swatch, TIMEOFF_COLOURS } from "../wall/Key.tsx";
import { useApp } from "../../store.ts";
import { useChrome } from "./shared.tsx";
import { KindChip } from "../ahead/MonthRail.tsx";

const TONES: MarkTone[] = ["bad", "warn", "quiet"];
// Time-off requests are not drawn on the Schedule screen (the Time off page handles them), so the guide leaves them out.
const kindsOf = (t: MarkTone) => (Object.keys(MARKS) as MarkKind[]).filter((k) => MARK_TONE[k] === t && !TIMEOFF_MARKS.includes(k));

export function IconGuide() {
  const open = useChrome((s) => s.guide);
  const setGuide = useChrome((s) => s.setGuide);
  const view = useApp((s) => s.view);
  // The part about the screen you came from comes first.
  const first = (k: "timeoff" | "ahead") => ({ order: view === k ? -1 : 0 });
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
          <div tabIndex={0} role="region" aria-label="Colours and pictures" className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 focus-visible:outline-2 focus-visible:outline-ink">
            <section aria-label="Colours">
              <h3 className="mb-1.5 text-sm font-semibold">Colours, by store</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {COLOURS.store.map((c) => <li key={c.name} className="flex items-center gap-2.5"><Swatch block={c.block} mark={c.mark} n={c.n} past={c.past} sev={c.sev} /><span><b>{c.name}</b> <span className="text-muted">{c.line}</span></span></li>)}
              </ul>
              <h3 className="mb-1.5 mt-3 text-sm font-semibold">Colours, by person</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {COLOURS.pharmacist.map((c) => <li key={c.name} className="flex items-center gap-2.5"><Swatch block={c.block} mark={c.mark} sev={c.sev} /><span><b>{c.name}</b> <span className="text-muted">{c.line}</span></span></li>)}
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
                      <dt className="flex w-9 shrink-0 justify-center rounded-md py-1" style={{ backgroundColor: t === "bad" ? "var(--w-bad)" : t === "warn" ? "var(--w-warn)" : "var(--color-ok-lite)" }}><BlockMark kind={k} tone={t} size={22} /><span className="sr-only">{MARKS[k].name}</span></dt>
                      <dd><b>{MARKS[k].name}</b> <span className="text-muted">{MARKS[k].meaning}</span></dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <section aria-label="Time off screen" className="mt-4" style={first("timeoff")}>
              <h3 className="mb-1.5 text-sm font-semibold">On the Time off screen</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {TIMEOFF_COLOURS.map((c) => <li key={c.name} className="flex items-center gap-2.5"><Swatch block={c.block} mark={c.mark} past={c.past} sev={c.sev} /><span><b>{c.name}</b> <span className="text-muted">{c.line}</span></span></li>)}
              </ul>
              <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                {TIMEOFF_MARKS.map((k) => (
                  <div key={k} className="flex items-center gap-2.5">
                    <dt className="flex w-9 shrink-0 justify-center py-1"><BlockMark kind={k} size={22} /><span className="sr-only">{MARKS[k].name}</span></dt>
                    <dd><b>{MARKS[k].name}</b> <span className="text-muted">{MARKS[k].meaning}</span></dd>
                  </div>
                ))}
              </dl>
            </section>
            <section aria-label="Plan ahead" className="mt-4" style={first("ahead")}>
              <h3 className="mb-1.5 text-sm font-semibold">On Plan ahead</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                <li className="flex items-center gap-2.5"><span className="w-28 shrink-0"><KindChip kind="empty" /></span><span className="text-muted">Nothing is scheduled for that month yet.</span></li>
                <li className="flex items-center gap-2.5"><span className="w-28 shrink-0"><KindChip kind="drafting" /></span><span className="text-muted">Being built: shifts are still open or a rule is broken. Nobody has been told.</span></li>
                <li className="flex items-center gap-2.5"><span className="w-28 shrink-0"><KindChip kind="ready" /></span><span className="text-muted">Every shift is covered and no rule is broken. Post it when you are happy.</span></li>
                <li className="flex items-center gap-2.5"><span className="w-28 shrink-0"><KindChip kind="posted" rev={1} /></span><span className="text-muted">Posted. You can keep editing; the month then says how many days changed since posting.</span></li>
              </ul>
            </section>
            <p className="mt-4 text-sm text-muted">A problem you accepted keeps its colour and picture, faded, so you can see it is handled but still true. The details are in the hover note and in the Inspector. Pointing at a block (or right click) lists the names and the reasons.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
