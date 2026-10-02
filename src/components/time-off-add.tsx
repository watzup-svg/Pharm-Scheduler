import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ImpactList } from "@/components/day-sheet-extras";
import { announce } from "@/components/undo";
import { useMedia } from "@/components/use-media";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { useStoreTag } from "@/components/use-store-tag";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { DayPicker } from "@/components/day-picker";
import { sortPeopleByHome } from "@/lib/schedule/fix";
import { riskDates, timeOffImpact } from "@/lib/schedule/impact";
import { formatDateList, keepOpenPtoDates } from "@/lib/schedule/pto";
import { isRphRole } from "@/lib/schedule/slots";
import { dayLoads, duplicateDates, entriesOf, overlapFor } from "@/lib/schedule/timeoff-view";
import { useScheduleStore } from "@/store/schedule-store";
import { toast } from "sonner";
import { Mark, reasonIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type AddSeed = {
  names?: string[];
  dates?: string[];
  status?: "approved" | "requested";
  /** Editing this entry instead of adding. */
  editIndex?: number;
};

const REASONS = ["Vacation", "Sick", "Appointment", "Family", "Other"] as const;
type Reason = (typeof REASONS)[number];

/** "Sick · flu" → reason Sick, detail "flu". Anything that doesn't start with a reason is "Other". */
function splitNote(note: string): { reason: Reason | null; detail: string } {
  const [first = "", ...rest] = note.split(" · ");
  const hit = REASONS.find((r) => r !== "Other" && r.toLowerCase() === first.trim().toLowerCase());
  if (hit) return { reason: hit, detail: rest.join(" · ") };
  return { reason: note.trim() ? "Other" : null, detail: note.trim() };
}

function joinNote(reason: Reason | null, detail: string): string {
  const d = detail.trim();
  if (!reason) return d;
  if (reason === "Other") return d;
  return d ? `${reason} · ${d}` : reason;
}

export function AddTimeOffDrawer({ seed, onClose }: { seed: AddSeed | null; onClose: () => void }) {
  const wide = useMedia("(min-width: 1024px)");
  return (
    <Dialog open={seed !== null} onOpenChange={(o) => !o && onClose()}>
      {seed ? (
        <DialogContent
          title={seed.editIndex != null ? "Edit time off" : "Add time off"}
          drawer={wide}
          backdrop={wide}
          sheet={!wide}
          className="pb-0"
        >
          <Form seed={seed} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function StepLabel({ n, children, htmlFor }: { n: number; children: React.ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-2">
      <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream">
        {n}
      </span>
      {children}
    </Label>
  );
}

function Form({ seed, onClose }: { seed: AddSeed; onClose: () => void }) {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const addMany = useScheduleStore((s) => s.addTimeOffMany);
  const update = useScheduleStore((s) => s.updateTimeOff);
  const showOnSchedule = useShowOnSchedule();
  const editing = seed.editIndex != null;
  const editEntry = editing ? entriesOf(doc).find((e) => e.index === seed.editIndex) : undefined;
  const [names, setNames] = useState<string[]>(seed.names ?? (editEntry ? [editEntry.t.name] : []));
  const [dates, setDates] = useState<string[]>(seed.dates ?? editEntry?.dates ?? []);
  const [status, setStatus] = useState<"approved" | "requested">(seed.status ?? "approved");
  const initial = splitNote(editEntry?.t.note ?? "");
  const [reason, setReason] = useState<Reason | null>(initial.reason);
  const [detail, setDetail] = useState(initial.detail);
  const [filter, setFilter] = useState("");
  const [multi, setMulti] = useState((seed.names?.length ?? 0) > 1);
  const [changing, setChanging] = useState(false);
  const loads = useMemo(() => dayLoads(doc), [doc]);
  // Someone who is sick is already out: there is nothing to decide.
  const effectiveStatus = reason === "Sick" ? "approved" : status;
  const note = joinNote(reason, detail);

  const pharmacists = useMemo(
    () => sortPeopleByHome(doc, doc.people.filter((p) => isRphRole(p.role)).map((p) => p.name)),
    [doc],
  );
  const shown = pharmacists.filter((n) => n.toLowerCase().includes(filter.trim().toLowerCase()));
  const risky = useMemo(() => riskDates(doc, names), [doc, names]);

  const preview = useMemo(
    () =>
      names.slice(0, 8).map((name) => {
        const { kept, skipped } = keepOpenPtoDates(doc, name, dates);
        const dup = duplicateDates(doc, name, kept, seed.editIndex ?? -1);
        const fresh = kept.filter((d) => !dup.includes(d));
        const impact = fresh.length ? timeOffImpact(doc, name, fresh) : [];
        return { name, skipped, dup, fresh, holes: impact.filter((i) => i.becomesHole) };
      }),
    [doc, names, dates, seed.editIndex],
  );
  const others = useMemo(() => {
    const out = new Map<string, string>();
    for (const name of names) {
      for (const o of overlapFor(doc, name, dates, seed.editIndex ?? -1)) {
        if (!names.includes(o.name)) out.set(o.name, o.status === "requested" ? `${o.name} (asked)` : o.name);
      }
    }
    return [...out.values()];
  }, [doc, names, dates, seed.editIndex]);

  const holeCount = preview.reduce((n, p) => n + p.holes.length, 0);
  const usable = preview.reduce((n, p) => n + p.fresh.length, 0);
  const missing = !names.length ? "Choose who is off." : !dates.length ? "Choose the days." : !usable ? "Nothing new to add for those days." : "";
  const firstHole = preview.flatMap((p) => p.holes)[0];

  function pickName(n: string) {
    if (multi) {
      setNames((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
      return;
    }
    setNames([n]);
    setChanging(false);
    setFilter("");
  }

  function save(thenFind: boolean) {
    if (missing) return;
    if (editing) {
      const err = update(seed.editIndex!, { dates, note });
      if (err) {
        toast.error(err);
        return;
      }
      announce(`Saved ${names[0]}, ${formatDateList(dates)}`);
      onClose();
      return;
    }
    const r = addMany({ names, dates, note, status: effectiveStatus });
    if (r.error) {
      toast.error(r.error);
      return;
    }
    const who = names.length === 1 ? names[0]! : `${names.length} people`;
    const extra = [r.skippedClosed ? `${r.skippedClosed} closed ${r.skippedClosed === 1 ? "day" : "days"} skipped` : "", r.skippedDuplicate ? `${r.skippedDuplicate} already logged` : ""]
      .filter(Boolean)
      .join(" · ");
    const warn = effectiveStatus === "approved" && holeCount ? ` Leaves ${holeCount} ${holeCount === 1 ? "shift" : "shifts"} with no coverage.` : "";
    announce(`${effectiveStatus === "requested" ? "Request added" : "Added"}: ${who}, ${formatDateList(dates)}${extra ? ` (${extra})` : ""}.${warn}`);
    onClose();
    if (thenFind && firstHole) showOnSchedule({ store: firstHole.store, slot: firstHole.slot, day: firstHole.day }, true);
  }

  const willFind = effectiveStatus === "approved" && holeCount > 0 && !editing;
  const picked = names.length === 1 && !multi && !changing;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2" aria-label="Who is off">
        <StepLabel n={1} htmlFor="to-find">
          Who is off
        </StepLabel>
        {editing ? (
          <p className="text-sm font-medium">{names[0]}</p>
        ) : picked ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-line">
            <p className="min-w-0 truncate text-sm">
              <span className="font-semibold">{names[0]}</span>{" "}
              <span className="text-muted">{tag(doc.people.find((p) => p.name === names[0])?.home ?? "—")}</span>
            </p>
            <div className="flex shrink-0 gap-1">
              <button type="button" className="min-h-11 rounded-md px-2 text-sm font-medium underline" onClick={() => setChanging(true)}>
                Change
              </button>
              <button type="button" className="min-h-11 rounded-md px-2 text-sm font-medium underline" onClick={() => setMulti(true)}>
                Add another
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" />
              <Input id="to-find" className="pl-9" placeholder="Search pharmacists" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            {multi ? <p className="text-xs text-muted">Tick everyone who is off. {names.length ? `${names.length} chosen.` : ""}</p> : null}
            <ul className="max-h-44 overflow-y-auto rounded-lg bg-white ring-1 ring-line" aria-label="Pharmacists">
              {shown.length ? (
                shown.map((n) => {
                  const home = doc.people.find((p) => p.name === n)?.home;
                  const on = names.includes(n);
                  return (
                    <li key={n}>
                      {multi ? (
                        <label className="flex h-11 items-center gap-2 px-3 text-sm">
                          <input type="checkbox" className="size-5 accent-ink" checked={on} onChange={() => pickName(n)} />
                          <span className="font-medium">{n}</span>
                          <span className="text-muted">{home && home !== "—" ? tag(home) : "—"}</span>
                        </label>
                      ) : (
                        <button type="button" onClick={() => pickName(n)} className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-paper">
                          <span className="font-medium">{n}</span>
                          <span className="text-muted">{home && home !== "—" ? tag(home) : "—"}</span>
                        </button>
                      )}
                    </li>
                  );
                })
              ) : (
                <li className="px-3 py-3 text-sm text-muted">No one matches.</li>
              )}
            </ul>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="When">
        <StepLabel n={2}>When</StepLabel>
        <DayPicker doc={doc} dates={dates} onChange={setDates} names={names} loads={loads} riskDates={risky} label="Days" />
      </section>

      <section className="flex flex-col gap-2" aria-label="Why">
        <StepLabel n={3}>Why</StepLabel>
        <Segmented<Reason>
          tone="ink"
          label="Reason"
          className="flex-wrap"
          value={(reason ?? "") as Reason}
          onChange={(r) => setReason(reason === r ? null : r)}
          options={REASONS.map((r) => ({ value: r, label: <span className="inline-flex items-center gap-2"><Mark icon={reasonIcon(r)} className="size-4" />{r}</span> }))}
        />
        <Input id="to-note" aria-label="Details (optional)" maxLength={140} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={reason === "Other" ? "What for?" : "Details (optional)"} />
        {!editing && reason !== "Sick" ? (
          <div className="mt-1 flex flex-col gap-2">
            <Label>Has this been decided?</Label>
            <Segmented
              tone="ink"
              label="Status"
              className="flex-wrap"
              value={status}
              onChange={setStatus}
              options={[
                { value: "approved", label: "Already approved" },
                { value: "requested", label: "Waiting for my decision" },
              ]}
            />
          </div>
        ) : reason === "Sick" ? (
          <p className="text-xs text-muted">Sick time is recorded as approved straight away.</p>
        ) : null}
      </section>

      {names.length && dates.length ? (
        <section aria-label="What this does" className="flex flex-col gap-2" aria-live="polite">
          <h3 className="text-sm font-semibold">Details</h3>
          {preview.some((p) => p.skipped.length) ? (
            <p className="text-xs text-muted">Closed days at their home store are skipped.</p>
          ) : null}
          {preview.filter((p) => p.dup.length).map((p) => (
            <p key={p.name} className="rounded-lg bg-warn-bg/60 px-3 py-2 text-xs text-warn">
              {p.name} already has {formatDateList(p.dup)} logged. Those won’t be added twice.
            </p>
          ))}
          {others.length ? <p className="rounded-lg bg-paper px-3 py-2 text-xs ring-1 ring-line">Also off or asking those days: {others.join(", ")}.</p> : null}
          {preview.filter((p) => p.holes.length).map((p) => (
            <div key={p.name} className="flex flex-col gap-1">
              {preview.length > 1 ? <p className="text-xs font-semibold">{p.name}</p> : null}
              <ImpactList items={p.holes} />
            </div>
          ))}
          {holeCount && effectiveStatus === "requested" ? <p className="text-xs text-muted">It’s a request, so nothing changes until you approve it.</p> : null}
        </section>
      ) : null}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-cream px-4 py-3 sm:-mx-5 sm:px-5">
        <p className="text-sm text-pretty" aria-live="polite">
          {missing ? (
            <span className="font-medium text-ink">{missing}</span>
          ) : (
            <>
              <span className="font-semibold">{names.length === 1 ? names[0] : `${names.length} people`}</span>
              <span className="text-muted">
                {" "}
                · {formatDateList(dates)} · {dates.length} {dates.length === 1 ? "day" : "days"}
                {reason ? ` · ${reason}` : ""} · {effectiveStatus === "approved" ? "approved" : "waiting"}
              </span>
              {holeCount ? (
                <span className={cn("block font-medium", effectiveStatus === "approved" ? "text-illegal" : "text-warn")}>
                  {effectiveStatus === "approved" ? "Leaves" : "Would leave"} {holeCount} {holeCount === 1 ? "shift" : "shifts"} with no coverage
                </span>
              ) : (
                <span className="block font-medium text-ok">Every store stays covered</span>
              )}
            </>
          )}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {willFind ? (
            <>
              <Button type="button" variant="secondary" disabled={Boolean(missing)} onClick={() => save(false)}>
                Add only
              </Button>
              <Button type="button" variant="away" disabled={Boolean(missing)} onClick={() => save(true)}>
                Add and find cover
              </Button>
            </>
          ) : (
            <Button type="button" variant="away" disabled={Boolean(missing)} onClick={() => save(false)}>
              {editing ? "Save changes" : effectiveStatus === "requested" ? "Add request" : "Add time off"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
