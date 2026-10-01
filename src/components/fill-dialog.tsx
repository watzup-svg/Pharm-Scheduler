import { useMemo, useState } from "react";
import { CloseStoreMenu } from "@/components/close-menu";
import { Avatar, DriveTag } from "@/components/graphics";
import { RoleMark } from "@/components/icons";
import { choicesFor, offerable } from "@/lib/schedule/dashboard";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { monthName } from "@/lib/schedule/calendar";
import { planFill } from "@/lib/schedule/plan";
import { driveLabel, rankCandidates } from "@/lib/schedule/suggest";
import { cn } from "@/lib/utils";
import { useStoreTag } from "@/components/use-store-tag";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

export function FillDialog() {
  const open = useViewStore((s) => s.fillOpen);
  const setOpen = useViewStore((s) => s.setFillOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? <FillBody close={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

/** A proposal for every open shift. The manager ticks what to keep; nothing is placed until she presses the button. */
function FillBody({ close }: { close: () => void }) {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const placeMany = useScheduleStore((s) => s.placeMany);
  const rows = useMemo(() => planFill(doc), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Long drives start unticked: she should choose those on purpose.
  const [off, setOff] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.pick && r.pick.home !== r.store && (r.pick.driveMinutes ?? 0) >= 90).map((r) => `${r.store}|${r.day}`)),
  );
  const mon = monthName(doc.year, doc.month).slice(0, 3);
  const key = (r: { store: string; day: number }) => `${r.store}|${r.day}`;
  const [swap, setSwap] = useState<Record<string, string>>({});
  const nameFor = (r: (typeof rows)[number]) => swap[key(r)] ?? r.pick?.name ?? "";
  const chosen = rows.filter((r) => r.pick && !off.has(key(r)));
  // Others free for a row, never someone already used on that day in another row.
  const current = (r: (typeof rows)[number]) => {
    const n = swap[key(r)];
    return (n ? rankCandidates(doc, r.store, r.day, r.slot).find((c) => c.name === n) : null) ?? r.pick!;
  };
  const alternatives = (r: (typeof rows)[number]) => {
    const used = new Set(rows.filter((x) => x.day === r.day && key(x) !== key(r) && x.pick && !off.has(key(x))).map((x) => nameFor(x)));
    return rankCandidates(doc, r.store, r.day, r.slot)
      .filter((c) => c.state === "free" && !used.has(c.name))
      .slice(0, 6);
  };

  function apply() {
    const n = placeMany(chosen.map((r) => ({ store: r.store, slot: r.slot, day: r.day, name: nameFor(r) })));
    announce(`Scheduled ${n} ${n === 1 ? "person" : "people"} on shifts with no coverage`);
    close();
  }

  return (
    <DialogContent
      sheet
      title="Fill the shifts with no coverage"
      description="Best free person for each, never twice in a day. Untick or change any. Nothing changes until you confirm."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Every open store has a pharmacist. No coverage gaps.</p>
      ) : (
        <>
        <div className="mb-2 flex flex-col gap-1" aria-live="polite">
          <span role="img" aria-label={`${chosen.length} of ${rows.length} shifts get a pharmacist`} className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {rows.map((r) => (
              <span key={key(r)} className={cn("h-full flex-1", r.pick && !off.has(key(r)) ? "bg-ok" : "bg-illegal/70")} />
            ))}
          </span>
          <p className="text-xs text-muted">
            {chosen.length} of {rows.length} covered
            {rows.length - chosen.length > 0 ? <span className="font-medium text-illegal"> · {rows.length - chosen.length} stay with no coverage</span> : null}
          </p>
        </div>
        <ul className="-mx-1 flex max-h-[58dvh] flex-col gap-2 overflow-y-auto overscroll-contain px-1 py-1">
          {rows.map((r) => {
            const cur = r.pick ? current(r) : null;
            return (
            <li key={key(r)} className="rounded-xl bg-white p-3 ring-1 ring-line">
              <p className="text-sm font-semibold">
                {r.storeName} · {r.weekday.slice(0, 3)} {mon} {r.day}
              </p>
              {r.pick ? (
                <>
                <label className="mt-1 flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 accent-ink" checked={!off.has(key(r))} onChange={(e) => setOff((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(key(r)); else n.add(key(r)); return n; })} />
                  <Avatar name={cur!.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{cur!.name}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <RoleMark float={cur!.float} store={tag(cur!.home)} />
                      {cur!.driveMinutes != null && cur!.home !== r.store ? <DriveTag text={`${driveLabel(cur!.driveMinutes, cur!.driveEstimated)} drive`} long={cur!.driveMinutes >= 90} /> : null}
                    </span>
                    {cur!.cautions.filter((c) => c !== "Long drive").length ? <span className="block text-xs font-medium text-warn">{cur!.cautions.filter((c) => c !== "Long drive").join(" · ")}</span> : null}
                  </span>
                </label>
                  <NativeSelect aria-label={`Someone else for ${r.storeName}, ${mon} ${r.day}`} className="mt-1 ml-[3.75rem] h-11 max-w-[calc(100%-3.75rem)] text-sm" value={cur!.name} onChange={(e) => setSwap((p) => ({ ...p, [key(r)]: e.target.value }))}>
                    {[cur!, ...alternatives(r).filter((a) => a.name !== cur!.name)].map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name === r.pick!.name ? `${a.name} (suggested)` : a.name}{a.home !== r.store && a.driveMinutes != null ? ` · ${driveLabel(a.driveMinutes, a.driveEstimated)} drive` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </>
              ) : (
                <div className="mt-1">
                  <p className="text-sm text-illegal">No one is free that day, so it stays uncovered.</p>
                  <NoOneFree store={r.store} day={r.day} />
                  <CloseStoreMenu store={r.store} day={r.day} onDone={close} />
                </div>
              )}
            </li>
            );
          })}
        </ul>
        </>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button type="button" disabled={chosen.length === 0} onClick={apply}>
          Schedule {chosen.length} {chosen.length === 1 ? "person" : "people"}
        </Button>
      </div>
    </DialogContent>
  );
}

/** When nobody is free: who could be moved from a store that has a second pharmacist, and who is on time off. */
function NoOneFree({ store, day }: { store: string; day: number }) {
  const doc = useScheduleStore((s) => s.doc);
  const tag = useStoreTag();
  const all = choicesFor(doc, store, day).filter((c) => !c.here);
  const movable = all.filter((c) => c.state === "double" && offerable(c) && c.elsewhereSolo.length === 0);
  const off = all.filter((c) => c.state === "off");
  const dayoff = all.filter((c) => c.state === "dayoff" && offerable(c));
  if (!movable.length && !off.length && !dayoff.length) return null;
  return (
    <div className="mt-1 text-xs text-muted">
      {movable.length ? (
        <p>Could move from a store that has two: {movable.map((c) => `${c.name} (from ${c.elsewhere.map(tag).join(", ")})`).join(", ")}. Open the day to do it.</p>
      ) : null}
      {dayoff.length ? <p>Usual day off, ask first: {dayoff.map((c) => c.name).join(", ")}. Open the day to schedule one.</p> : null}
      {off.length ? <p>On time off that day: {off.map((c) => c.name).join(", ")}.</p> : null}
    </div>
  );
}
