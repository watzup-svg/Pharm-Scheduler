import { CloseStoreMenu } from "@/components/close-menu";
import { Mark } from "@/components/icons";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { announce } from "@/components/undo";
import { useStoreTag } from "@/components/use-store-tag";
import { bestDirectDrive, coverPlans, MAX_DRIVE, type CoverMove, type CoverPlan } from "@/lib/schedule/cover-plan";
import { shortStoreName } from "@/lib/schedule/fix";
import { mileageText } from "@/lib/schedule/mileage";
import { previewPlan } from "@/lib/schedule/plan-preview";
import { driveLabel, driveText } from "@/lib/schedule/suggest";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";

const first = (n: string) => n.split(" ")[0] ?? n;

/**
 * Shorter ways to fill an empty shift: a second pharmacist moved from a store that has two, or a short chain of moves, instead
 * of one long drive. Shown only when it beats just sending the nearest free person, or when nobody is simply free. It proposes;
 * "Use this plan" applies the whole thing as one step that can be undone.
 */
export function ShorterDrives({ store, day, onDone }: { store: string; day: number; onDone: () => void }) {
  const doc = useScheduleStore((s) => s.doc);
  const apply = useScheduleStore((s) => s.applyCoverPlan);
  const tag = useStoreTag();
  const result = useMemo(() => coverPlans(doc, store, day), [doc, store, day]);
  const direct = useMemo(() => bestDirectDrive(doc, store, day), [doc, store, day]);
  const storeName = shortStoreName(doc.stores.find((s) => s.code === store)?.name ?? store);

  if (result.leaveClosed && direct == null) {
    return (
      <section aria-label="No one can reach" className="flex flex-col gap-2 rounded-xl bg-illegal-bg px-3 py-3 text-illegal ring-1 ring-illegal/25">
        <p role="status" className="text-sm font-medium">
          No one can reach {storeName} within {driveText(MAX_DRIVE)} that day without leaving another store with no pharmacist and nothing nearer works. Leaving it closed is your call.
        </p>
        <div>
          <CloseStoreMenu store={store} day={day} variant="secondary" onDone={onDone} />
        </div>
      </section>
    );
  }
  const best = result.plans[0];
  const worthShowing = best && (direct == null || (direct >= 40 && best.longest + 15 <= direct));
  if (!worthShowing) return null;
  const plans = result.plans.filter((p) => direct == null || p.longest + 15 <= direct || p === best);
  const anyEstimated = plans.some((p) => p.estimated);

  function use(plan: CoverPlan) {
    const res = apply(plan.moves, day, plan.opens);
    if (res !== "ok") {
      toast.error(res);
      return;
    }
    announce(`${plan.moves.map((m) => first(m.name)).join(" and ")} moved to cover ${storeName}`);
    onDone();
  }

  return (
    <section aria-label="Shorter drives" className="overflow-hidden rounded-xl bg-white ring-1 ring-ok/40">
      <header className="flex items-center gap-2 bg-ok-bg px-3 py-3">
        <Mark icon="drive" tip={false} className="size-5 text-ok" />
        <h3 className="flex-1 text-base font-semibold">Shorter drives</h3>
        {direct != null ? (
          <span data-tip={`Sending the nearest free person is ${driveText(direct)} each way`} className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-ok">
            was {driveText(direct)}
          </span>
        ) : (
          <span data-tip="Nobody is simply free that day. These plans move people who are already scheduled" className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-ok">
            nobody free
          </span>
        )}
      </header>
      <ul className="flex flex-col divide-y divide-line">
        {plans.map((p, i) => (
          <li key={p.id} className="flex flex-col gap-2 p-3">
            <ul className="flex flex-col gap-1.5">
              {p.moves.map((m) => (
                <MoveLine key={`${m.name}>${m.to}`} m={m} tag={tag} />
              ))}
            </ul>
            <PreviewLine plan={p} day={day} tag={tag} />
            {p.opens.length ? (
              <p className="rounded-lg bg-warn-bg px-2 py-1 text-xs font-medium text-warn">
                Leaves {p.opens.map((c) => tag(c)).join(", ")} with no pharmacist. It will get its own suggestions, or you can close it.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <span data-tip={`Longest drive ${driveText(p.longest)} | ${p.moves.length} ${p.moves.length === 1 ? "person moves" : "people move"}, ${driveText(p.totalMinutes)} of driving in all`} className={cn("rounded-full px-2 py-0.5 text-xs font-bold", p.extreme ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok")}>
                {p.extreme ? "long drive " : "longest "}
                {driveLabel(p.longest, p.longestEstimated)}
              </span>
              {p.mileageUnknown ? (
                <span data-tip="A distance from a home store is unknown, so its mileage is not counted" className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-bold text-warn">mileage unknown</span>
              ) : p.paidMiles > 0 ? (
                <span data-tip={`${p.paidMiles} more paid miles than where they are now, both ways, past 20 miles from each home store`} className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-ink ring-1 ring-line">
                  {p.mileageDollars != null ? `+$${p.mileageDollars.toFixed(2)} mileage` : `+${p.paidMiles} paid mi`}
                </span>
              ) : null}
              {p.unknown ? <span data-tip="No drive time is known for one of these moves, so 1 hour is assumed" className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-bold text-warn">time unknown</span> : null}
              <span className="flex-1" />
              <Button type="button" size="sm" variant={i === 0 ? "default" : "secondary"} onClick={() => use(p)}>
                Use this plan
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {plans.every((p) => p.opens.length) ? (
        <div className="flex flex-col gap-1 border-t border-line px-3 py-2 text-xs text-muted">
          <span>Every option here leaves another store bare. Closing {storeName} for the day is also your call.</span>
          <CloseStoreMenu store={store} day={day} variant="ghost" onDone={onDone} />
        </div>
      ) : null}
      {anyEstimated ? <p className="border-t border-line px-3 py-2 text-xs text-muted">~ means an estimated drive time. Exact times are set under Setup, Stores.</p> : null}
    </section>
  );
}

function MoveLine({ m, tag }: { m: CoverMove; tag: (code: string) => string }) {
  const leaves = m.from ? `leaves ${tag(m.from)}` : m.origin ? `from ${tag(m.origin)}` : "";
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="font-semibold">{first(m.name)}</span>
      <span className="text-muted">{m.float ? "float · " : ""}{leaves ? `${leaves} → ` : "→ "}<span className="font-semibold text-ink">{tag(m.to)}</span></span>
      <span className="text-muted">{m.minutes == null ? "time unknown" : m.minutes === 0 ? "home store" : driveLabel(m.minutes, m.estimated)}</span>
      {m.ferry ? <span data-tip="Crosses on the Wahkiakum ferry. The time includes the wait; missing the boat adds up to an hour" className="rounded-full bg-white px-1.5 text-xs font-bold text-ink ring-1 ring-line">ferry</span> : null}
      {m.mileage.paidMiles !== 0 ? <span className="text-xs text-muted">{mileageText(m.mileage)}</span> : null}
      {m.from && m.leftWith?.length ? <span className="basis-full text-xs text-muted">{tag(m.from)} keeps {m.leftWith.map(first).join(" and ")}</span> : null}
    </li>
  );
}

/** What the plan would do to the month, worked out on a copy before anything is written. */
function PreviewLine({ plan, day, tag }: { plan: CoverPlan; day: number; tag: (code: string) => string }) {
  const doc = useScheduleStore((s) => s.doc);
  const pv = useMemo(() => previewPlan(doc, plan, day), [doc, plan, day]);
  if (!pv.ok) return <p className="text-xs text-illegal">{pv.problem ?? "This plan can't be applied now"}</p>;
  const [was, now] = pv.holes;
  return (
    <p data-testid="plan-preview" className="text-xs text-muted">
      <span className="font-semibold text-ink">Preview</span> · empty shifts this month {was} → <span className={now < was ? "font-semibold text-ok" : now > was ? "font-semibold text-illegal" : "font-semibold text-ink"}>{now}</span>
      {pv.shortened.length ? <span className="text-warn"> · leaves {pv.shortened.map((x) => tag(x.store)).join(", ")} with one pharmacist on a two-pharmacist day</span> : null}
    </p>
  );
}
