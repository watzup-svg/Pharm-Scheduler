import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ICON_GUIDE, Mark } from "@/components/icons";
import { MARKS, StateMark, type MarkKind } from "@/components/marks";

const KIND_OF = new Map((Object.entries(MARKS) as [MarkKind, (typeof MARKS)[MarkKind]][]).map(([k, v]) => [v.icon, k]));
import { useViewStore } from "@/store/view-store";

/** What every small picture in the app means. Opened from File → Icon guide, or from any “What do these mean?” link. */
export function IconGuide() {
  const open = useViewStore((s) => s.iconGuideOpen);
  const setOpen = useViewStore((s) => s.setIconGuideOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? (
        <DialogContent sheet title="Icon guide" description="Every picture used in the app, and what it means.">
          <div className="flex max-h-[68dvh] flex-col gap-5 overflow-y-auto overscroll-contain pr-1">
            {ICON_GUIDE.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h3 className="mb-2 text-sm font-semibold">{group.title}</h3>
                <dl className="flex flex-col gap-2">
                  {group.items.map((it) => (
                    <div key={it.name} className="flex items-start gap-3">
                      <dt className="flex size-9 shrink-0 items-center justify-center">
                        {KIND_OF.has(it.icon) ? (
                          <StateMark kind={KIND_OF.get(it.icon)!} size={28} tip={false} />
                        ) : (
                          <span className="flex size-7 items-center justify-center rounded-md bg-fill text-ink ring-1 ring-ink/10">
                            <Mark icon={it.icon} className="size-4" />
                          </span>
                        )}
                        <span className="sr-only">{it.name}</span>
                      </dt>
                      <dd className="min-w-0 pt-0.5 text-sm">
                        <span className="font-semibold">{it.name}</span>
                        <span className="block text-pretty text-muted">{it.meaning}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
