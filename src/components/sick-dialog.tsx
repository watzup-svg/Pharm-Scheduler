import { Phone, X } from "lucide-react";
import { CloseStoreMenu } from "@/components/close-menu";
import { Avatar, DriveTag } from "@/components/graphics";
import { RoleMark } from "@/components/icons";
import { useMemo, useState } from "react";
import { announce } from "@/components/undo";
import { DayPicker } from "@/components/day-picker";
import { dayLoads } from "@/lib/schedule/timeoff-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { daysInMonth, isoDate, monthName, todayParts, weekdayLong } from "@/lib/schedule/calendar";
import { awayFromHome } from "@/lib/schedule/dashboard";
import { getCell } from "@/lib/schedule/grid";
import { sickShifts, type SickShift } from "@/lib/schedule/sick";
import { driveLabel, rankCandidates } from "@/lib/schedule/suggest";
import { isRphRole, RPH_SLOTS } from "@/lib/schedule/slots";
import { cn } from "@/lib/utils";
import { useStoreTag } from "@/components/use-store-tag";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

export function SickDialog() {
  const sick = useViewStore((s) => s.sick);
  const close = useViewStore((s) => s.closeSick);
  return (
    <Dialog open={sick != null} onOpenChange={(o) => (!o ? close() : undefined)}>
      {sick ? <SickBody seed={sick} close={close} /> : null}
    </Dialog>
  );
}

function SickBody({ seed, close }: { seed: { name: string; day: number }; close: () => void }) {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const callInSick = useScheduleStore((s) => s.callInSick);
  const setCell = useScheduleStore((s) => s.setCell);
  const today = todayParts();
  const last = daysInMonth(doc.year, doc.month);
  const startDay = seed.day || (today.year === doc.year && today.month === doc.month ? today.day : 1);
  const [name, setName] = useState(seed.name);
  const [picked, setPicked] = useState<string[]>([isoDate(doc.year, doc.month, Math.min(startDay, last))]);
  const loads = useMemo(() => dayLoads(doc), [doc]);
  // Set once "Mark out sick" is pressed: from then on this list is what still needs cover.
  const [reason, setReason] = useState<"Called in sick" | "Time off">("Called in sick");
  const [marked, setMarked] = useState<SickShift[] | null>(null);
  const [showDouble, setShowDouble] = useState<string>("");
  // People she has called who said no, per shift. Kept only while this box is open.
  const [declined, setDeclined] = useState<Record<string, string[]>>({});

  const days = useMemo(() => picked.filter((d) => d.startsWith(isoDate(doc.year, doc.month, 1).slice(0, 7))).map((d) => Number(d.slice(8, 10))).sort((a, b) => a - b), [picked, doc.year, doc.month]);
  const from = days[0] ?? startDay;
  const shifts = useMemo(() => (name && !marked ? sickShifts(doc, name, days) : []), [doc, name, days, marked]);
  const pharmacists = doc.people.filter((p) => isRphRole(p.role));
  const working = new Set(
    pharmacists
      .filter((p) => doc.stores.some((s) => RPH_SLOTS.some((sl) => getCell(doc.grid, s.code, sl, from).trim() === p.name)))
      .map((p) => p.name),
  );
  const phoneOf = (n: string) => doc.people.find((p) => p.name === n)?.phone?.trim() ?? "";
  const dateLabel = (d: number) => `${weekdayLong(doc.year, doc.month, d).slice(0, 3)} ${monthName(doc.year, doc.month).slice(0, 3)} ${d}`;

  function mark() {
    const list = sickShifts(doc, name, days);
    callInSick(name, days, reason);
    setMarked(list);
    announce(`${name} marked out${reason === "Called in sick" ? " sick" : ""}, ${days.length === 1 ? dateLabel(days[0]!) : `${dateLabel(days[0]!)} to ${dateLabel(days[days.length - 1]!)}`}`);
  }

  function place(s: SickShift, who: string) {
    setCell(s.store, s.slot, s.day, who);
    const now = useScheduleStore.getState().doc;
    const home = awayFromHome(now, who, s.store);
    announce(`${who} on ${s.storeName}, ${dateLabel(s.day)}`, home ? `${who} is away from home: their store is ${home}.` : undefined);
  }

  return (
    <DialogContent
      sheet
      title={marked ? `Cover for ${name}` : "Someone is out"}
      description={
        marked
          ? "Best matches first. Call, then tap Schedule."
          : "Choose who is out and which days. Nothing changes until you confirm."
      }
    >
      {!marked ? (
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-2">
            <span className="font-medium">Who called in sick?</span>
            <NativeSelect value={name} onChange={(e) => setName(e.target.value)} aria-label="Who called in sick">
              <option value="">Choose a pharmacist</option>
              {working.size ? (
                <optgroup label={`Working ${dateLabel(from)}`}>
                  {pharmacists.filter((p) => working.has(p.name)).map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} · {tag(p.home)}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Everyone else">
                {pharmacists.filter((p) => !working.has(p.name)).map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} · {tag(p.home)}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-medium">Why</legend>
            <div className="flex gap-2">
              {(["Called in sick", "Time off"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  className={cn(
                    "inline-flex h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-semibold",
                    reason === r ? "bg-warn-bg text-warn ring-1 ring-warn/40" : "bg-fill text-ink hover:bg-shut",
                  )}
                >
                  {r === "Called in sick" ? "Called in sick" : "Time off"}
                </button>
              ))}
            </div>
          </fieldset>
          <DayPicker doc={doc} dates={picked} onChange={setPicked} names={name ? [name] : []} loads={loads} label="Days out" />
          {name ? (
            <div className="rounded-xl bg-white p-3 ring-1 ring-line" role="status">
              {shifts.length === 0 ? (
                <p className="text-muted">{name} isn’t scheduled on those days. This only records the time off.</p>
              ) : (
                <>
                  <p className="font-semibold">
                    {shifts.length} {shifts.length === 1 ? "shift needs" : "shifts need"} cover:
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {shifts.map((s) => (
                      <li key={`${s.store}|${s.day}|${s.slot}`}>
                        {s.storeName}, {dateLabel(s.day)}
                        {s.othersStay.length ? <span className="text-muted"> · {s.othersStay.join(", ")} still there</span> : <span className="font-medium text-illegal"> · no coverage if they leave</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="button" variant="away" disabled={!name || !days.length} onClick={mark}>
              {shifts.length ? "Mark out and find cover" : "Mark out"}
            </Button>
          </div>
          {!name || !days.length ? <p className="-mt-1 text-right text-xs text-muted">{!name ? "Choose who is out." : "Choose at least one day."}</p> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {marked.length === 0 ? <p className="text-muted">{name} is marked out. No shifts need cover.</p> : null}
          <ul className="-mx-1 flex max-h-[62dvh] flex-col gap-3 overflow-y-auto overscroll-contain px-1 py-1">
            {marked.map((s) => {
              const key = `${s.store}|${s.day}|${s.slot}`;
              const filled = getCell(doc.grid, s.store, s.slot, s.day).trim();
              const ranked = filled ? [] : rankCandidates(doc, s.store, s.day, s.slot, { exclude: [name] });
              const said = declined[key] ?? [];
              const free = ranked.filter((c) => c.state === "free" && !said.includes(c.name));
              const doubles = ranked.filter((c) => c.state === "double" || c.state === "dayoff");
              return (
                <li key={key} className={cn("rounded-xl p-3 ring-1", filled && filled !== name ? "bg-ok-bg ring-ok/30" : "bg-white ring-line")}>
                  <p className="font-semibold">
                    {s.storeName} · {dateLabel(s.day)}
                    {s.othersStay.length ? <span className="font-normal text-muted"> · {s.othersStay.join(", ")} is still there</span> : null}
                  </p>
                  {filled === name ? (
                    <p className="mt-1 text-muted">{name} is back on this shift (undone).</p>
                  ) : filled ? (
                    <p className="mt-1 font-medium text-ok">Covered by {filled}.</p>
                  ) : (
                    <>
                      {free.length === 0 ? <p className="mt-1 text-illegal">No one is free that day.{doubles.length ? " People working at another store or on a usual day off are listed below." : ""}</p> : null}
                      <ul className="mt-2 flex flex-col gap-2">
                        {(showDouble === key ? [...free, ...doubles] : free.slice(0, 5)).map((c, i) => {
                          const phone = phoneOf(c.name);
                          return (
                            <li key={c.name} className="flex flex-col gap-2 rounded-lg bg-paper px-3 py-2">
                              <div className="flex min-w-0 items-start gap-3">
                                <Avatar name={c.name} />
                                <div className="min-w-0">
                                  <p className="flex flex-wrap items-center gap-x-2">
                                    <span className="font-medium">{c.name}</span>
                                    {i === 0 && c.state === "free" ? (
                                      <span className="shrink-0 rounded-sm bg-night px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase">Best fit</span>
                                    ) : null}
                                  </p>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                                    <RoleMark float={c.float} store={tag(c.home)} />
                                    {c.driveMinutes != null && c.home !== s.store ? <DriveTag text={driveLabel(c.driveMinutes, c.driveEstimated)} long={c.driveMinutes >= 90} /> : null}
                                    <span>
                                      {c.reasons
                                        .filter((r) => r !== "Free that day" && r !== "Float" && !r.includes("drive from") && !r.startsWith("Licensed"))
                                        .slice(0, 2)
                                        .join(" · ")}
                                      {c.state === "double" ? " · working at another store" : c.state === "dayoff" ? " · usual day off, ask first" : ""}
                                    </span>
                                  </p>
                                  {c.cautions.filter((x) => x !== "Long drive").length ? <p className="text-xs font-medium text-warn">{c.cautions.filter((x) => x !== "Long drive").join(" · ")}</p> : null}
                                  {!phone ? <p className="text-xs text-muted">No phone on file (add it on the People page)</p> : null}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {phone ? (
                                  <Button asChild size="sm" variant="secondary" className="flex-1">
                                    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} aria-label={`Call ${c.name} at ${phone}`}>
                                      <Phone className="size-4" />
                                      {phone}
                                    </a>
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`${c.name} said no. Ask someone else.`}
                                  title="Said no"
                                  onClick={() => setDeclined({ ...declined, [key]: [...said, c.name] })}
                                >
                                  <X />
                                </Button>
                                <Button type="button" size="sm" variant="secondary" className={phone ? "" : "flex-1"} onClick={() => place(s, c.name)} aria-label={`Schedule ${c.name} at ${s.storeName}, ${dateLabel(s.day)}`}>
                                  Schedule
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      {said.length ? (
                        <p className="mt-1 text-xs text-muted">
                          Said no: {said.join(", ")}{" "}
                          <button type="button" className="min-h-11 font-medium underline" onClick={() => setDeclined({ ...declined, [key]: [] })}>
                            ask them again
                          </button>
                        </p>
                      ) : null}
                      <div className="mt-1">
                        <CloseStoreMenu store={s.store} day={s.day} />
                      </div>
                      {showDouble !== key && (free.length > 5 || doubles.length > 0) ? (
                        <button type="button" className="mt-1 min-h-11 text-sm font-medium text-ink underline" onClick={() => setShowDouble(key)}>
                          {free.length > 5 ? `More people (${free.length - 5} free${doubles.length ? `, ${doubles.length} already working` : ""})` : `Show ${doubles.length} already working that day`}
                        </button>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  );
}
