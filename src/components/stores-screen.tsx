import { benchFor } from "@/lib/schedule/bench";
import { Mark } from "@/components/icons";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { storeHoursLine } from "@/lib/schedule/coverage";
import { daysInMonth, isStoreOpen } from "@/lib/schedule/calendar";
import { issueKey } from "@/lib/schedule/rules";
import { storeRun } from "@/lib/schedule/insight";
import { useMemo, useState } from "react";
import { useStoreTag } from "@/components/use-store-tag";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Count, HeroIcon, HeroLead, PageStrip } from "@/components/page-strip";
import { WeekdayBars } from "@/components/hero-graphics";
import { Dialog, DialogContent, useWide } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { missingNumbers } from "@/lib/schedule/label";
import { cn } from "@/lib/utils";
import { DriveTimes } from "@/components/drive-times";
import { announce } from "@/components/undo";
import { confirmAction } from "@/components/confirm";
import type { Store } from "@/lib/schedule/types";
import { useScheduleStore } from "@/store/schedule-store";

const EMPTY: Store = { code: "", name: "", satOpen: true, sunOpen: false, address: "", phone: "", hours: "", holidayNote: "" };

export function StoresScreen() {
  const doc = useScheduleStore((s) => s.doc);
  const addStore = useScheduleStore((s) => s.addStore);
  const updateStore = useScheduleStore((s) => s.updateStore);
  const removeStore = useScheduleStore((s) => s.removeStore);
  const [form, setForm] = useState<Store>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const wide = useWide();
  const setStoreLabels = useScheduleStore((s) => s.setStoreLabels);
  const noNumber = missingNumbers(doc);

  function startEdit(s: Store) {
    setEditing(s.code);
    setForm({ ...s });
    setFormOpen(true);
  }

  async function confirmRemove(s: Store) {
    const homed = doc.people.filter((x) => x.home === s.code).length;
    const ok = await confirmAction({
      title: `Remove ${s.name}?`,
      effects: [
        "Its schedule, day notes and holidays are deleted.",
        homed ? `${homed} ${homed === 1 ? "pharmacist loses" : "pharmacists lose"} their home store. Choose new ones on the People page.` : "No pharmacist has it as a home store.",
      ],
      confirmLabel: "Remove store",
      tone: "danger",
      note: "You can undo this.",
    });
    if (!ok) return;
    removeStore(s.code);
    announce(`Removed ${s.name}`);
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = editing ? updateStore(editing, form) : addStore(form);
    if (err) {
      toast.error(err);
      return;
    }
    announce(editing ? `Saved ${form.code.trim().toUpperCase()}` : `Added ${form.code.trim().toUpperCase()}`);
    setForm(EMPTY);
    setEditing(null);
    setFormOpen(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6">
      <PageStrip
        title="Stores"
        lead={
          <HeroLead n={doc.stores.length} icon={<Mark icon="home" tip={false} />} tip={`Stores · ${doc.stores.length} | With their hours, addresses and phone numbers`} />
        }
        tiles={
          <>
            <Count n={doc.stores.filter((s) => s.satOpen).length} tip={`Open Saturdays · ${doc.stores.filter((s) => s.satOpen).length} of ${doc.stores.length} stores`}>
              <HeroIcon>Sa</HeroIcon>
            </Count>
            <Count n={doc.stores.filter((s) => s.sunOpen).length} tip={`Open Sundays · ${doc.stores.filter((s) => s.sunOpen).length} of ${doc.stores.length} stores`}>
              <HeroIcon>Su</HeroIcon>
            </Count>
          </>
        }
        actions={
          <Button
            type="button"
            variant="light"
            aria-label="Add store"
            onClick={() => {
              setEditing(null);
              setForm(EMPTY);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add
          </Button>
        }
        graphic={<WeekdayBars doc={doc} />}
      />

      <section aria-label="How stores are named" className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <h2 className="text-sm font-semibold text-muted" title="Name stores by | Used across the app and on printed pages">Name stores by</h2>
        <Segmented
          label="Name stores by"
          value={doc.storeLabels ?? "code"}
          onChange={(v) => setStoreLabels(v)}
          options={[
            { value: "code", label: "Letters", hint: doc.stores[0]?.code ?? "EST" },
            { value: "number", label: "Store number", hint: doc.stores.find((s) => s.number)?.number ?? "4127" },
          ]}
        />
        {noNumber.length ? (
          <p className="basis-full text-sm text-warn">
            {noNumber.length} {noNumber.length === 1 ? "store has" : "stores have"} no number yet and show their letters: {noNumber.join(", ")}. Add numbers with Edit.
          </p>
        ) : null}
      </section>

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}>
      <DialogContent sheet drawer={wide} backdrop title={editing ? `Edit ${editing}` : "Add a store"} description="Open days, phone and address.">
      <form onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-code">Code</Label>
            <Input
              id="s-code" maxLength={8}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="EST"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-number">Store number (optional)</Label>
            <Input id="s-number" maxLength={12} value={form.number ?? ""} onChange={(e) => setForm({ ...form, number: e.target.value.trim() || undefined })} placeholder="4127" inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name" maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Estacada"
              required
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="s-address">Address</Label>
            <Input
              id="s-address" maxLength={160}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="325 S Broadway St, Estacada, OR 97023"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="s-phone">Store phone</Label>
            <Input
              id="s-phone" maxLength={40}
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              autoComplete="off"
              placeholder="(503) 555-0100"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="s-hours">Regular hours</Label>
            <Input
              id="s-hours" maxLength={240}
              value={form.hours ?? ""}
              onChange={(e) => setForm({ ...form, hours: e.target.value })}
              placeholder="Mon–Fri 9:00 AM–6:00 PM; Sat 9:00 AM–2:00 PM; Sun closed"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="s-holiday">Holiday closures (note)</Label>
            <Input
              id="s-holiday" maxLength={240}
              value={form.holidayNote ?? ""}
              onChange={(e) => setForm({ ...form, holidayNote: e.target.value })}
              placeholder="Add actual closed dates on the Holidays page"
            />
          </div>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-ink"
              checked={form.satOpen}
              onChange={(e) => setForm({ ...form, satOpen: e.target.checked })}
            />
            Open Saturday
          </label>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-ink"
              checked={form.sunOpen}
              onChange={(e) => setForm({ ...form, sunOpen: e.target.checked })}
            />
            Open Sunday
          </label>
          <fieldset className="flex flex-col gap-1 sm:col-span-2">
            <legend className="text-sm font-medium">Closed on (Monday to Friday)</legend>
            <div className="flex flex-wrap gap-x-3">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
                <label key={d} className="flex h-11 min-w-11 items-center gap-2 px-1 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-ink"
                    checked={(form.closedWeekdays ?? []).includes(i + 1)}
                    onChange={(e) => {
                      const cur = form.closedWeekdays ?? [];
                      setForm({ ...form, closedWeekdays: e.target.checked ? [...cur, i + 1].sort() : cur.filter((x) => x !== i + 1) });
                    }}
                  />
                  {d}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">For a store that’s closed a regular weekday. Weekends are set above; one-off closings go on the Holidays page.</p>
          </fieldset>
          <fieldset className="flex flex-col gap-1 sm:col-span-2">
            <legend className="text-sm font-medium">Usually two pharmacists on</legend>
            <div className="flex flex-wrap gap-x-3">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                <label key={d} className="flex h-11 min-w-11 items-center gap-2 px-1 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-ink"
                    checked={(form.twoPharmacistDays ?? []).includes(i)}
                    onChange={(e) => {
                      const cur = form.twoPharmacistDays ?? [];
                      const next = e.target.checked ? [...cur, i].sort() : cur.filter((x) => x !== i);
                      setForm({ ...form, twoPharmacistDays: next });
                    }}
                  />
                  {d}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">Optional. A day with only one pharmacist gets a “1 of 2” reminder. Never blocks printing.</p>
          </fieldset>
        </div>
        <div className="mt-4 flex gap-2">
          <Button type="submit">{editing ? "Save store" : "Add store"}</Button>
          <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          {editing ? (
            <Button type="button" variant="ghost" className="ml-auto text-illegal" onClick={() => { const st = doc.stores.find((x) => x.code === editing); if (st) confirmRemove(st); }}>
              Remove store
            </Button>
          ) : null}
        </div>
      </form>
      </DialogContent>
      </Dialog>

      <ul className="flex flex-col gap-2 md:hidden" aria-label="Stores">
        {doc.stores.map((s) => (
          <li key={s.code} className="surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  {s.name} <span className="text-sm font-normal text-muted">{s.code}{s.number ? ` · #${s.number}` : ""}</span>
                </p>
                <p className="text-xs text-muted">{s.address || "No address"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <StoreGlance store={s} />
                  {(() => {
                    const n = doc.people.filter((p) => p.home === s.code).length;
                    return n === 0 ? <span className="font-semibold text-warn">No home staff</span> : <span className="text-muted">{n} home {n === 1 ? "pharmacist" : "pharmacists"}</span>;
                  })()}
                </div>
                {s.twoPharmacistDays?.length ? (
                  <p className="mt-0.5 text-xs text-muted">Two pharmacists on {s.twoPharmacistDays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}</p>
                ) : null}
              </div>
              <Button variant="secondary" size="sm" onClick={() => startEdit(s)} aria-label={`Edit ${s.name}`}>
                Edit
              </Button>
            </div>
            {s.phone ? (
              <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-medium">
                {s.phone}
              </a>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto surface md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-sm font-semibold text-ink">
              <th className="px-4 py-3">Letters</th>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Open days</th>
              <th className="px-4 py-3" title="Pharmacists whose home store this is">Home staff</th>
              <th className="px-4 py-3" title="Licensed pharmacists from other stores within an hour’s drive">Bench</th>
              <th className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {doc.stores.map((s) => (
              <tr key={s.code} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{s.code}</td>
                <td className="px-4 py-3">{s.number ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    data-tip={[s.name, s.address, s.phone, s.twoPharmacistDays?.length ? `Two pharmacists on ${s.twoPharmacistDays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}` : ""].filter(Boolean).join(" | ")}
                  >
                    {s.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StoreGlance store={s} />
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const n = doc.people.filter((p) => p.home === s.code).length;
                    return n === 0 ? (
                      <span className="font-semibold text-warn" title="No one has this as a home store, so suggestions can’t prefer anyone by drive time.">None</span>
                    ) : (
                      n
                    );
                  })()}
                </td>
                <td className="relative px-4 py-3">
                  <BenchCell store={s.code} />
                </td>
                <td className="px-4 py-1 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => startEdit(s)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${s.name}`} title="Remove" className="text-muted hover:bg-illegal-bg hover:text-illegal" onClick={() => confirmRemove(s)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DriveTimes />
    </div>
  );
}

/** The store's open weekdays, then its month in one thin line: a brick tick per empty open day, and the longest unbroken run of one pharmacist. */
function StoreGlance({ store }: { store: Store }) {
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const n = daysInMonth(doc.year, doc.month);
  const ticks = useMemo(
    () => Array.from({ length: n }, (_, i) => (!isStoreOpen(store, doc.year, doc.month, i + 1, n, doc.holidays) ? "closed" : ev.byKey[issueKey(store.code, i + 1)]?.hole ? "hole" : "ok")),
    [doc, ev, store, n],
  );
  const holes = ticks.filter((t) => t === "hole").length;
  const run = useMemo(() => storeRun(doc, store.code), [doc, store.code]);
  return (
    <span className="flex flex-col gap-1.5">
      <WeekGlyph store={store} />
      <span className="flex items-center gap-2">
        <span
          role="img"
          aria-label={holes ? `${holes} open days with no pharmacist` : "Every open day covered"}
          data-tip={holes ? `${holes} open ${holes === 1 ? "day" : "days"} with no pharmacist` : "Every open day has a pharmacist"}
          className="flex h-4 items-end gap-px"
        >
          {ticks.map((t, i) => (
            <span key={i} aria-hidden className={cn("w-[3px] rounded-[1px]", t === "hole" ? "h-4 bg-illegal" : t === "closed" ? "h-1 bg-black/10" : "h-2 bg-ok/50")} />
          ))}
        </span>
        {run ? (
          <span
            data-tip={`Longest run: ${run.name}, ${run.days} open ${run.days === 1 ? "day" : "days"} in a row | ${run.changes} ${run.changes === 1 ? "change" : "changes"} of pharmacist this month`}
            className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-muted"
          >
            <Mark icon="home" tip={false} className="size-3.5" />
            {run.days}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Seven boxes, Sunday first: filled when the store is open that weekday, hatched when it is shut. */
function WeekGlyph({ store }: { store: Store }) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const open = (d: number) => (d === 0 ? store.sunOpen : d === 6 ? store.satOpen : !(store.closedWeekdays ?? []).includes(d));
  return (
    <span role="img" aria-label={storeHoursLine(store.satOpen, store.sunOpen, store.closedWeekdays)} title={store.hours || storeHoursLine(store.satOpen, store.sunOpen, store.closedWeekdays)} className="flex gap-0.5">
      {names.map((n, d) => (
        <span key={n} className={cn("grid size-6 place-items-center rounded-sm text-xs font-bold", open(d) ? "bg-ok-bg text-ink" : "bg-black/[0.06] text-muted")}>
          {n[0]}
        </span>
      ))}
    </span>
  );
}

/** How many licensed pharmacists from other stores could cover this one, within an hour. Tap to see who. */
function BenchCell({ store }: { store: string }) {
  const doc = useScheduleStore((s) => s.doc);
  const tag = useStoreTag();
  const bench = useMemo(() => benchFor(doc, store), [doc, store]);
  if (bench.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-illegal">
        <Mark icon="bench" label="Bench" className="size-4" />0
        <span className="sr-only"> pharmacists within an hour</span>
      </span>
    );
  }
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">
        <Mark icon="bench" className="size-4" />
        {bench.length}
        <span className="sr-only"> pharmacists within an hour. Show who.</span>
      </summary>
      <ul className="mb-1 flex flex-col gap-0.5 text-xs text-muted">
        {bench.map((b) => (
          <li key={b.name} className="whitespace-nowrap">
            {b.name} · {b.float ? "float " : ""}{tag(b.home)} · {b.minutes} min
          </li>
        ))}
      </ul>
    </details>
  );
}
