import { useStoreTag } from "@/components/use-store-tag";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { UsHolidaysPanel } from "@/components/us-holidays-panel";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { toast } from "sonner";
import { announce } from "@/components/undo";
import { getCell } from "@/lib/schedule/grid";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/icons";
import { HeroLead, PageStrip } from "@/components/page-strip";
import { MiniMonth } from "@/components/hero-graphics";
import { Dialog, DialogContent, useWide } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { monthDay, weekdayShort } from "@/lib/schedule/calendar";
import type { Holiday } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Fri Dec 25, 2026" from "2026-12-25". */
function prettyDate(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${weekdayShort(y, m, d).slice(0, 3)} ${MONTHS[m - 1]} ${d}, ${y}`;
}

const EMPTY: Holiday = { date: "", store: "ALL", label: "", repeat: false };

export function HolidaysScreen() {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const addHoliday = useScheduleStore((s) => s.addHoliday);
  const removeHoliday = useScheduleStore((s) => s.removeHoliday);
  const showOnSchedule = useShowOnSchedule();
  const [form, setForm] = useState<Holiday>(EMPTY);
  const [monthF, setMonthF] = useState(0);
  const [usOpen, setUsOpen] = useState(false);
  const mm = String(doc.month).padStart(2, "0");
  const [formOpen, setFormOpen] = useState(false);
  const wide = useWide();

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const err = addHoliday(form);
    if (err) {
      toast.error(err);
      return;
    }
    announce("Added holiday");
    // Anyone still named on the day just closed: say so, with a way to go to them.
    const added = form;
    const inMonth = Number(added.date.slice(0, 4)) === doc.year && Number(added.date.slice(5, 7)) === doc.month;
    const stranded = inMonth ? useScheduleStore.getState().evaluation.issues.filter((i) => i.leftover && i.day === Number(added.date.slice(8, 10))) : [];
    if (stranded.length) {
      const first = stranded[0]!;
      const who = [...new Set(stranded.flatMap((i) => i.leftoverNames))].map((n) => n.split(" ")[0]).join(", ");
      toast.warning(`${who} still ${stranded.length === 1 && first.leftoverNames.length === 1 ? "has" : "have"} a shift on a day you just closed.`, {
        duration: 10000,
        action: { label: "Open", onClick: () => showOnSchedule({ store: first.store, slot: "pharmacist", day: first.day }, true) },
      });
    }
    setForm(EMPTY);
    setFormOpen(false);
  }

  const monthOf = (h: Holiday) => Number(h.date.slice(5, 7));
  const rows = [...doc.holidays]
    .filter((h) => !monthF || monthOf(h) === monthF)
    .sort((a, b) => monthDay(a.date).localeCompare(monthDay(b.date)) || a.store.localeCompare(b.store));
  const perMonth = MONTHS.map((_, i) => doc.holidays.filter((h) => monthOf(h) === i + 1).length);

  /** Names on this month's schedule that land on a closed day because of this holiday. */
  function scheduledThatDay(h: Holiday): number | null {
    if (monthOf(h) !== doc.month || (!h.repeat && Number(h.date.slice(0, 4)) !== doc.year)) return null;
    const day = Number(h.date.slice(8, 10));
    const codes = h.store === "ALL" ? doc.stores.map((x) => x.code) : [h.store];
    let n = 0;
    for (const c of codes) for (const slot of RPH_SLOTS) if (getCell(doc.grid, c, slot, day).trim()) n += 1;
    return n;
  }

  function impact(h: Holiday) {
    const n = scheduledThatDay(h);
    if (n == null) return null;
    return n > 0 ? (
      <span className="block text-xs font-semibold text-illegal">{n} {n === 1 ? "name is" : "names are"} still scheduled that day</span>
    ) : (
      <span className="block text-xs text-muted">Nobody scheduled that day</span>
    );
  }

  function remove(h: Holiday) {
    removeHoliday(doc.holidays.indexOf(h));
    announce(`Removed ${h.label || "holiday"}, ${prettyDate(h.date)}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6">
      <PageStrip
        title="Holidays"
        lead={
          <HeroLead n={doc.holidays.length} icon={<Mark icon="closed" tip={false} />} tip={`Holidays and closures · ${doc.holidays.length} | Days a store is shut. A closed day cannot have a name on it`} />
        }
        tiles={
          <></>
        }
        actions={
          <>
            <Button type="button" variant="lightGhost" aria-label="Common U.S. holidays" aria-expanded={usOpen} onClick={() => setUsOpen(!usOpen)}>
              Common
            </Button>
            <Button type="button" variant="light" aria-label="Add holiday" onClick={() => { setForm(EMPTY); setFormOpen(true); }}>
              <Plus />
              Add
            </Button>
          </>
        }
        graphic={<MiniMonth
            doc={doc}
            dotFor={(d) => {
              const iso = `${doc.year}-${String(doc.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const hits = doc.holidays.filter((h) => h.date === iso || (h.repeat && h.date.slice(5) === iso.slice(5)));
              const head = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][doc.month - 1]} ${d}`;
              return hits.length ? { n: hits.length, tone: "off", lines: [`${head} · closed`, ...hits.slice(0, 4).map((h) => `${h.label || "Closure"} · ${h.store === "ALL" ? "every store" : tag(h.store)}`)] } : { n: 0, tone: "none", lines: [head] };
            }}
          />}
      />

      {usOpen ? <UsHolidaysPanel /> : null}

      <div role="group" aria-label="Holidays by month" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={monthF === 0}
          onClick={() => setMonthF(0)}
          className={cn("h-11 rounded-md px-3 text-sm font-semibold", monthF === 0 ? "bg-ink text-cream" : "bg-fill text-ink hover:bg-shut")}
        >
          Whole year · {doc.holidays.length}
        </button>
        {MONTHS.map((m, i) => (
          <button
            key={m}
            type="button"
            aria-pressed={monthF === i + 1}
            aria-label={`${m}: ${perMonth[i]} ${perMonth[i] === 1 ? "holiday" : "holidays"}`}
            onClick={() => setMonthF(monthF === i + 1 ? 0 : i + 1)}
            className={cn(
              "flex h-11 min-w-12 flex-col items-center justify-center rounded-md px-2 text-xs font-semibold leading-tight",
              monthF === i + 1 ? "bg-ink text-cream" : perMonth[i] ? "bg-fill text-ink hover:bg-shut" : "bg-paper text-muted",
              doc.month === i + 1 && monthF !== i + 1 && "border-b-2 border-ink",
            )}
          >
            {m}
            <span className="font-normal">{perMonth[i] || "·"}</span>
          </button>
        ))}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent sheet drawer={wide} backdrop title="Add a holiday" description="Closes one store, or every store with ALL.">
      <form onSubmit={onAdd}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="h-date">Date</Label>
            <Input
              id="h-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="h-store">Store</Label>
            <NativeSelect
              id="h-store"
              value={form.store}
              onChange={(e) => setForm({ ...form, store: e.target.value })}
            >
              <option value="ALL">ALL</option>
              {doc.stores.map((s) => (
                <option key={s.code} value={s.code}>
                  {tag(s.code)} · {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="h-label">Label</Label>
            <Input
              id="h-label" maxLength={80}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Labor Day"
            />
          </div>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-ink"
              checked={form.repeat}
              onChange={(e) => setForm({ ...form, repeat: e.target.checked })}
            />
            Repeat every year
          </label>
        </div>
        <div className="mt-4">
          <Button type="submit">Add holiday</Button>
          <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
      </DialogContent>
      </Dialog>


      <ul className="flex flex-col gap-2 md:hidden" aria-label="Holidays">
        {rows.length === 0 ? (
          <li>
            <EmptyState kind="holidays" title="No holidays yet" hint="Holidays close a store like a Sunday. Add one, or use “Common U.S. holidays” for the usual ones." />
          </li>
        ) : null}
        {rows.map((h, i) => {
          return (
            <li key={`${h.date}-${h.store}-${i}`} className="flex items-center gap-2 surface p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{h.label || "Closed"}</p>
                <p className="text-sm text-muted">
                  {prettyDate(h.date)} · {h.store === "ALL" ? "every store" : tag(h.store)} · {h.repeat ? "every year" : "this date only"}
                </p>
                {impact(h)}
              </div>
              <Button variant="ghost" size="icon" className="text-muted hover:bg-illegal-bg hover:text-illegal" title="Remove" onClick={() => remove(h)} aria-label={`Remove ${h.label || h.date}`}>
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto surface md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-sm font-semibold text-ink">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Repeats</th>
              <th className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={5}>
                  No holidays yet.
                </td>
              </tr>
            ) : (
              rows.map((h, i) => {
                const inMonth = monthDay(h.date).startsWith(`${mm}-`);
                return (
                  <tr
                    key={`${h.date}-${h.store}-${i}`}
                    className={cn("border-b border-line last:border-0", inMonth && "bg-why/40")}
                  >
                    <td className="px-4 py-3 font-medium tabular-nums whitespace-nowrap">{prettyDate(h.date)}</td>
                    <td className="px-4 py-3">{h.store === "ALL" ? "ALL" : tag(h.store)}</td>
                    <td className="px-4 py-3">{h.label || "—"}{h.closure ? <span className="ml-2 rounded-sm bg-night px-2 py-0.5 text-xs font-semibold text-white">closure</span> : null}{impact(h)}</td>
                    <td className="px-4 py-3">{h.repeat ? "Every year" : "This date only"}</td>
                    <td className="px-4 py-1 text-right whitespace-nowrap">
                      {inMonth ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            showOnSchedule({
                              store: h.store === "ALL" ? (doc.stores[0]?.code ?? "") : h.store,
                              slot: "pharmacist",
                              day: Number(h.date.slice(8, 10)),
                            })
                          }
                        >
                          Show on schedule
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" className="text-muted hover:bg-illegal-bg hover:text-illegal" title="Remove" aria-label={`Remove ${h.label || h.date}`} onClick={() => remove(h)}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
