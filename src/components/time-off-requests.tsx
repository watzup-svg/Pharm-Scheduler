import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { AlarmMark } from "@/components/marks";
import { Mark } from "@/components/icons";
import { monthName } from "@/lib/schedule/calendar";
import { useStoreTag } from "@/components/use-store-tag";
import { MonthStrip } from "@/components/time-off-parts";
import { announce, announceApproval } from "@/components/undo";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { Button } from "@/components/ui/button";
import { HoldButton } from "@/components/ui/hold-button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { requestHints, safeToApprove, timeOffImpact } from "@/lib/schedule/impact";
import { formatDateList } from "@/lib/schedule/pto";
import { dayLoads, entriesOf, firstDate, isWaiting, noticeDays, olderRequests, overlapFor, type TimeOffEntry } from "@/lib/schedule/timeoff-view";
import { useScheduleStore } from "@/store/schedule-store";

/** Requests waiting, soonest first. Each card shows the month with the asked-for days outlined, so the decision has its context. */
export function RequestsTab() {
  const doc = useScheduleStore((s) => s.doc);
  const loads = useMemo(() => dayLoads(doc), [doc]);
  const rows = useMemo(
    () => entriesOf(doc).filter((e) => isWaiting(doc, e.t)).sort((a, b) => firstDate(a).localeCompare(firstDate(b))),
    [doc],
  );
  // Requests from an earlier month are not waiting any more; say where they went so nothing seems to vanish.
  const older = olderRequests(doc).length;
  const olderNote = older ? (
    <p className="text-sm text-muted">
      {older} undecided {older === 1 ? "request is" : "requests are"} from an earlier month, so {older === 1 ? "it isn't" : "they aren't"} counted here. {older === 1 ? "It's" : "They're"} still in the List tab.
    </p>
  ) : null;
  if (!rows.length) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState kind="timeoff" title="No requests waiting" hint="Add time off with “Ask me first” and it waits here until you approve or decline it. It changes nothing on the schedule meanwhile." />
        {olderNote}
      </div>
    );
  }
  const setStatus = useScheduleStore.getState().setTimeOffStatus;
  const safeNow = rows.filter((e) => safeToApprove(doc, e.t.name, e.dates));
  function approveSafe() {
    // One at a time against the current schedule, so two requests that together empty a store are not both approved.
    let n = 0;
    for (const e of rows) {
      const now = useScheduleStore.getState().doc;
      if (!safeToApprove(now, e.t.name, e.dates)) continue;
      setStatus(e.index, "approved");
      n += 1;
    }
    announce(`Approved ${n} ${n === 1 ? "request" : "requests"} that leave every store covered. ${rows.length - n} left to decide.`);
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">These are waiting for a yes or a no.</p>
      {safeNow.length > 1 ? (
        <HoldButton variant="secondary" className="self-start" holdMs={900} onHold={approveSafe}>
          <Check />
          Approve {safeNow.length} safe
        </HoldButton>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Requests waiting">
        {rows.map((e) => (
          <RequestCard key={`${e.t.name}-${e.index}`} entry={e} loads={loads} />
        ))}
      </ul>
      {olderNote}
    </div>
  );
}

function RequestCard({ entry, loads }: { entry: TimeOffEntry; loads: ReturnType<typeof dayLoads> }) {
  const doc = useScheduleStore((s) => s.doc);
  const tag = useStoreTag();
  const setStatus = useScheduleStore((s) => s.setTimeOffStatus);
  const showOnSchedule = useShowOnSchedule();
  const { t, dates, index } = entry;
  const key = dates.join();
  const impact = useMemo(() => timeOffImpact(doc, t.name, dates), [doc, t.name, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const holes = impact.filter((i) => i.becomesHole);
  const hints = useMemo(() => requestHints(doc, t.name, dates), [doc, t.name, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const alsoAsked = useMemo(() => overlapFor(doc, t.name, dates, index).filter((o) => o.status === "requested"), [doc, t.name, key, index]); // eslint-disable-line react-hooks/exhaustive-deps
  const notice = noticeDays(entry);
  const label = `${t.name}, ${formatDateList(dates)}`;
  const [confirmDecline, setConfirmDecline] = useState(false);

  function approve(thenFind: boolean) {
    setStatus(index, "approved");
    announceApproval(`Approved ${label}.${holes.length ? ` Leaves ${holes.length} ${holes.length === 1 ? "shift" : "shifts"} with no coverage.` : ""}`, index);
    if (thenFind && holes[0]) showOnSchedule({ store: holes[0].store, slot: holes[0].slot, day: holes[0].day }, true);
  }

  return (
    <li className="accent-away flex flex-col gap-3 rounded-xl bg-white p-4 pl-5 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p
          className="text-base font-semibold"
          data-tip={[t.name, t.note, t.requestedOn ? `Asked ${formatDateList([t.requestedOn])}` : "", notice != null ? (notice <= 3 ? `${Math.max(notice, 0)} ${notice === 1 ? "day" : "days"} notice` : `${notice} days ahead`) : ""].filter(Boolean).join(" | ")}
        >
          {t.name}
        </p>
        <p className="text-sm font-medium tabular-nums">
          {formatDateList(dates)} · {dates.length}d
        </p>
      </div>

      <MonthStrip
        doc={doc}
        loads={loads}
        highlight={new Set(dates)}
        label="This month: the asked-for days are outlined. Shaded days have people already off. Dashed days have other requests."
      />

      <div className="flex flex-wrap items-center gap-2">
        {holes.map((h) => (
          <span
            key={`${h.store}|${h.day}`}
            data-tip={[`${h.storeName} · ${monthName(doc.year, doc.month).slice(0, 3)} ${h.day} would have no pharmacist`, h.suggestions.length ? `Free: ${h.suggestions.map((x) => x.name).join(", ")}` : "Nobody is free"].join(" | ")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-illegal-bg px-2 py-1 text-sm font-semibold tabular-nums text-illegal"
          >
            <AlarmMark kind="hole" size={18} tip={false} />
            {tag(h.store)} {h.day}
            {h.suggestions.length === 0 ? <span className="text-xs font-semibold">· none free</span> : null}
          </span>
        ))}
        {hints.length || alsoAsked.length ? (
          <span
            data-tip={[...hints, alsoAsked.length ? `Also asked: ${alsoAsked.map((o) => o.name).join(", ")}` : ""].filter(Boolean).join(" | ")}
            className="inline-flex items-center gap-1 rounded-lg bg-warn-bg px-2 py-1 text-warn"
          >
            <Mark icon="problem" tip={false} className="size-4" />
            <span className="text-sm font-semibold tabular-nums">{hints.length + alsoAsked.length}</span>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => approve(false)}>
          <Check />
          Approve
        </Button>
        {holes.length ? (
          <Button type="button" variant="secondary" data-tip="Approves it, then opens the first day that would be left empty" onClick={() => approve(true)}>
            Find cover
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setConfirmDecline(true)}>
          Decline
        </Button>
        {impact[0] ? (
          <Button type="button" variant="ghost" onClick={() => showOnSchedule({ store: impact[0]!.store, slot: impact[0]!.slot, day: impact[0]!.day })}>
            Show
          </Button>
        ) : null}
      </div>
      <Dialog open={confirmDecline} onOpenChange={setConfirmDecline}>
        <DialogContent title={`Decline ${t.name}?`} description={`${formatDateList(dates)}. It moves to Declined in the List, and you can reopen it there.`}>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Keep waiting
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                setConfirmDecline(false);
                setStatus(index, "declined");
                announce(`Declined ${label}`);
              }}
            >
              Decline
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
