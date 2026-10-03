import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { AlarmMark } from "@/components/marks";
import { useStoreTag } from "@/components/use-store-tag";
import { dayLabel } from "@/components/time-off-parts";
import { announce, announceApproval } from "@/components/undo";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { Button } from "@/components/ui/button";
import { HoldButton } from "@/components/ui/hold-button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { requestHints, safeToApprove, timeOffImpact } from "@/lib/schedule/impact";
import { formatDateList } from "@/lib/schedule/pto";
import type { ScheduleDoc } from "@/lib/schedule/types";
import { entriesOf, firstDate, isWaiting, noticeDays, olderRequests, overlapFor, type TimeOffEntry } from "@/lib/schedule/timeoff-view";
import { useScheduleStore } from "@/store/schedule-store";

/** Requests waiting, soonest first. Each card shows the month with the asked-for days outlined, so the decision has its context. */
export function RequestsTab() {
  const doc = useScheduleStore((s) => s.doc);
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
          <RequestCard key={`${e.t.name}-${e.index}`} entry={e} />
        ))}
      </ul>
      {olderNote}
    </div>
  );
}

/** "Mon Oct 12 to Fri Oct 16 · 5 days" */
function datesInWords(doc: ScheduleDoc, dates: string[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "";
  const word = (iso: string) => dayLabel(doc, Number(iso.slice(8, 10)));
  const span = first === last ? word(first) : `${word(first)} to ${word(last)}`;
  return `${span} · ${dates.length} ${dates.length === 1 ? "day" : "days"}`;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[6.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** A request as a slip: four facts, then the buttons. The month is not redrawn here. */
function RequestCard({ entry }: { entry: TimeOffEntry }) {
  const doc = useScheduleStore((s) => s.doc);
  const tag = useStoreTag();
  const setStatus = useScheduleStore((s) => s.setTimeOffStatus);
  const showOnSchedule = useShowOnSchedule();
  const { t, dates, index } = entry;
  const key = dates.join();
  const impact = useMemo(() => timeOffImpact(doc, t.name, dates), [doc, t.name, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const holes = impact.filter((i) => i.becomesHole);
  const holeGroups = useMemo(() => {
    const by = new Map<string, { store: string; storeName: string; days: number[]; first: (typeof holes)[number] }>();
    for (const h of holes) {
      const g = by.get(h.store);
      if (g) g.days.push(h.day);
      else by.set(h.store, { store: h.store, storeName: h.storeName, days: [h.day], first: h });
    }
    return [...by.values()];
  }, [holes]);
  const out = useMemo(() => overlapFor(doc, t.name, dates, index), [doc, t.name, key, index]); // eslint-disable-line react-hooks/exhaustive-deps
  const thin = useMemo(() => requestHints(doc, t.name, dates).filter((h) => h.startsWith("Approving leaves")), [doc, t.name, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const notice = noticeDays(entry);
  const label = `${t.name}, ${formatDateList(dates)}`;
  const [confirmDecline, setConfirmDecline] = useState(false);

  function approve(findHole?: (typeof holes)[number]) {
    setStatus(index, "approved");
    announceApproval(`Approved ${label}.${holes.length ? ` Leaves ${holes.length} ${holes.length === 1 ? "shift" : "shifts"} with no coverage.` : ""}`, index);
    if (findHole) showOnSchedule({ store: findHole.store, slot: findHole.slot, day: findHole.day }, true);
  }

  const asked = [t.requestedOn ? `Asked ${formatDateList([t.requestedOn])}` : "", notice != null ? (notice <= 3 ? `${Math.max(notice, 0)} ${notice === 1 ? "day" : "days"} notice` : `${notice} days ahead`) : ""].filter(Boolean).join(" · ");

  return (
    <li className="accent-away flex flex-col gap-3 rounded-xl bg-white p-4 pl-5 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-base font-semibold">{t.name}</p>
        <p className="text-sm font-medium tabular-nums">{formatDateList(dates)}</p>
      </div>

      <dl className="flex flex-col gap-2">
        <Fact label="Who">
          {t.note || <span className="text-muted">No reason given</span>}
          {asked ? <span className="block text-xs text-muted">{asked}</span> : null}
        </Fact>
        <Fact label="Dates">{datesInWords(doc, dates)}</Fact>
        <Fact label="Also out">
          {out.length ? (
            out.map((o, i) => (
              <span key={o.name}>
                {i ? ", " : ""}
                {o.name}
                {o.status === "requested" ? <span className="text-muted"> (asked)</span> : null}
              </span>
            ))
          ) : (
            <span className="text-muted">No one else</span>
          )}
        </Fact>
        <Fact label="Stores">
          {holes.length ? (
            <ul className="flex flex-col gap-1.5" aria-label="Stores left bare">
              {holeGroups.map((g) => (
                <li key={g.store} className="flex flex-wrap items-center gap-2">
                  <span
                    data-tip={[`${g.storeName} would have no pharmacist on ${g.days.map((d) => dayLabel(doc, d)).join(", ")}`, g.first.suggestions.length ? `Free ${dayLabel(doc, g.first.day)}: ${g.first.suggestions.map((x) => x.name).join(", ")}` : "Nobody is free"].join(" | ")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-illegal-bg px-2 py-1 font-semibold tabular-nums text-illegal"
                  >
                    <AlarmMark kind="hole" size={18} tip={false} />
                    {tag(g.store)} · {g.days.map((d) => dayLabel(doc, d)).join(", ")}
                    {g.first.suggestions.length === 0 ? <span className="text-xs font-semibold">· no one free</span> : null}
                  </span>
                  <Button type="button" variant="secondary" size="sm" aria-label={`Find cover for ${tag(g.store)} ${dayLabel(doc, g.first.day)}`} data-tip="Approves it, then opens the first bare day on the Schedule" onClick={() => approve(g.first)}>
                    Find cover
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <span>Every store stays covered</span>
          )}
          {thin.length ? <span className="mt-1 block text-xs text-warn">{thin.join(" ")}</span> : null}
        </Fact>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => approve()}>
          <Check />
          Approve
        </Button>
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
