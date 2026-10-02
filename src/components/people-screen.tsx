import { Mark, RoleMark } from "@/components/icons";
import { Phone, Plus, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/graphics";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Count, HeroIcon, HeroLead, PageStrip } from "@/components/page-strip";
import { PersonStrip } from "@/components/person-strip";
import { LicenceRings } from "@/components/hero-graphics";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, useWide } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PERSON_SWATCHES, personColorHex, personToneClass } from "@/lib/schedule/color";
import { daysWorked } from "@/lib/schedule/coverage";
import { saturdaysWorked } from "@/lib/schedule/dashboard";
import { WorkBar } from "@/components/work-bar";
import { WEEKDAYS } from "@/lib/schedule/calendar";
import { parsePeopleList, type ListProblem } from "@/lib/schedule/people-list";
import { announce } from "@/components/undo";
import { confirmAction } from "@/components/confirm";
import { stateName, statesInUse } from "@/lib/schedule/hints";
import { type Person, type Role } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useStoreTag } from "@/components/use-store-tag";
import { useScheduleStore } from "@/store/schedule-store";

const ASSIGNABLE_ROLES = ["Pharmacist", "Float Pharmacist"] as const satisfies readonly Role[];

const SWATCH_BG = [
  "bg-p0",
  "bg-p1",
  "bg-p2",
  "bg-p3",
  "bg-p4",
  "bg-p5",
  "bg-p6",
  "bg-p7",
] as const;

function emptyPerson(home: string): Person {
  return {
    name: "",
    role: "Pharmacist",
    home: home || "—",
    lead: false,
    phone: "",
    color: "",
  };
}

export function PeopleScreen() {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const addPerson = useScheduleStore((s) => s.addPerson);
  const updatePerson = useScheduleStore((s) => s.updatePerson);
  const removePerson = useScheduleStore((s) => s.removePerson);
  const addPeople = useScheduleStore((s) => s.addPeople);
  const [bulk, setBulk] = useState("");
  const [bulkProblems, setBulkProblems] = useState<ListProblem[]>([]);
  const [bulkOpen, setBulkOpen] = useState(doc.people.length === 0);
  const defaultHome = doc.stores[0]?.code ?? "—";
  const [form, setForm] = useState<Person>(() => emptyPerson(defaultHome));
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const wide = useWide();

  function startEdit(p: Person) {
    setEditing(p.name);
    setForm({ ...p });
    setFormOpen(true);
  }

  async function confirmRemove(p: Person) {
    const shifts = Object.values(doc.grid).reduce(
      (n, g) => n + Object.values(g ?? {}).reduce((m, row) => m + Object.values(row ?? {}).filter((x) => x === p.name).length, 0),
      0,
    );
    const offDays = doc.timeOff.filter((t) => t.name === p.name).length;
    const ok = await confirmAction({
      title: `Remove ${p.name}?`,
      effects: [
        `${shifts} ${shifts === 1 ? "shift is" : "shifts are"} taken off the schedule, leaving ${shifts === 1 ? "it" : "them"} with no coverage.`,
        offDays ? `${offDays} time-off ${offDays === 1 ? "entry is" : "entries are"} deleted.` : "No time off to delete.",
      ],
      confirmLabel: "Remove",
      tone: "danger",
      note: "You can undo this.",
    });
    if (!ok) return;
    removePerson(p.name);
    announce(`Removed ${p.name}`);
    setFormOpen(false);
    setEditing(null);
    setForm(emptyPerson(doc.stores[0]?.code ?? "—"));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = editing ? updatePerson(editing, form) : addPerson(form);
    if (err) {
      toast.error(err);
      return;
    }
    announce(editing ? `Saved ${form.name.trim()}` : `Added ${form.name.trim()}`);
    setForm(emptyPerson(doc.stores[0]?.code ?? "—"));
    setEditing(null);
    setFormOpen(false);
  }

  const [roleF, setRoleF] = useState<"" | Role>("");
  const [homeF, setHomeF] = useState("");
  const [sortBy, setSortBy] = useState<"role" | "name" | "home" | "days">("role");
  const maxPersonDays = useMemo(() => Math.max(1, ...doc.people.map((p) => daysWorked(doc, p.name))), [doc]);
  const noHome = useMemo(() => doc.people.filter((p) => !p.home || p.home === "—" || !doc.stores.some((x) => x.code === p.home)), [doc.people, doc.stores]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = needle
      ? doc.people.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            p.role.toLowerCase().includes(needle) ||
            p.home.toLowerCase().includes(needle),
        )
      : doc.people;
    if (roleF) list = list.filter((p) => p.role === roleF);
    if (homeF === "none") list = list.filter((p) => noHome.includes(p));
    else if (homeF) list = list.filter((p) => p.home === homeF);
    const days = new Map(list.map((p) => [p.name, daysWorked(doc, p.name)]));
    const home = (n: string) => doc.stores.findIndex((x) => x.code === doc.people.find((p) => p.name === n)?.home);
    return [...list].sort((a, b) =>
      sortBy === "name"
        ? a.name.localeCompare(b.name)
        : sortBy === "home"
          ? home(a.name) - home(b.name) || a.name.localeCompare(b.name)
          : sortBy === "days"
            ? (days.get(b.name) ?? 0) - (days.get(a.name) ?? 0) || a.name.localeCompare(b.name)
            : a.role.localeCompare(b.role) || a.name.localeCompare(b.name),
    );
  }, [doc, q, roleF, homeF, sortBy, noHome]);

  const homeOptions = doc.stores.map((s) => s.code);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6">
      <PageStrip
        title="People"
        lead={
          <HeroLead n={doc.people.length} icon={<Mark icon="home" tip={false} />} tip={`Pharmacists · ${doc.people.length} | Each has a home store and the states they are licensed in`} />
        }
        tiles={
          <>
            {statesInUse(doc).map((st) => (
              <Count key={st} label="licensed" n={doc.people.filter((p) => p.licensedStates?.includes(st)).length} tip={`Licensed in ${stateName(st)} | ${doc.people.filter((p) => p.licensedStates?.includes(st)).length} of ${doc.people.length} pharmacists`}>
                <HeroIcon>{st}</HeroIcon>
              </Count>
            ))}
          </>
        }
        actions={
          <>
            <Button type="button" variant="lightGhost" onClick={() => { setBulkOpen(true); window.setTimeout(() => document.getElementById("bulk-people")?.focus(), 50); }}>
              Add several
            </Button>
            <Button type="button" variant="light" aria-label="Add pharmacist" onClick={() => { setEditing(null); setForm(emptyPerson(doc.stores[0]?.code ?? "—")); setFormOpen(true); }}>
              <Plus />
              Add
            </Button>
          </>
        }
        graphic={<LicenceRings doc={doc} />}
      />

      {doc.people.length ? <PersonStrip /> : null}

      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) { setEditing(null); } }}>
      <DialogContent sheet drawer={wide} backdrop title={editing ? `Edit ${editing}` : "Add a pharmacist"} description="Every person has a home store.">
      <form onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="p-name">
            <Input
              id="p-name" maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoComplete="name"
            />
          </Field>
          <Field label="Role" htmlFor="p-role">
            <NativeSelect
              id="p-role"
              value={form.role}
              onChange={(e) => {
                const role = e.target.value as Role;
                setForm({ ...form, role, lead: false });
              }}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <p className="-mt-2 text-xs text-pretty text-muted sm:col-span-2">
            A <span className="font-semibold">float</span> has a home store too, but is suggested first when another store needs cover. Working away from home shows as <span className="font-semibold">cover</span>. The drive from home ranks suggestions.
          </p>
          <Field label="Home store" htmlFor="p-home">
            <NativeSelect
              id="p-home"
              value={form.home}
              onChange={(e) => setForm({ ...form, home: e.target.value })}
              required
            >
              {homeOptions.map((c) => (
                <option key={c} value={c}>
                  {tag(c)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Phone" htmlFor="p-phone">
            <Input
              id="p-phone" maxLength={40}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              autoComplete="tel"
            />
          </Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">Licensed in</legend>
            <div className="flex flex-wrap gap-x-4">
              {[...new Set([...statesInUse(doc), ...(form.licensedStates ?? [])])].map((code) => (
                <label key={code} className="flex h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-ink"
                    checked={(form.licensedStates ?? []).includes(code)}
                    onChange={(e) => {
                      const cur = form.licensedStates ?? [];
                      setForm({ ...form, licensedStates: e.target.checked ? [...cur, code] : cur.filter((c) => c !== code) });
                    }}
                  />
                  {stateName(code)}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">A pharmacist can only be scheduled in a state they’re licensed in. If none is checked, this person is only suggested at stores in their home store’s state.</p>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">With the company</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                First day (optional)
                <Input type="date" aria-label="First day with the company" value={form.startsOn ?? ""} onChange={(e) => setForm({ ...form, startsOn: e.target.value || undefined })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Last day (optional)
                <Input type="date" aria-label="Last day with the company" value={form.endsOn ?? ""} onChange={(e) => setForm({ ...form, endsOn: e.target.value || undefined })} />
              </label>
            </div>
            <p className="text-xs text-muted">Most people need neither; blank means available. Add a first day for a new hire or a last day for someone leaving. Days outside that range count as time off.</p>
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">Usual days off</legend>
            <div className="flex flex-wrap gap-x-3">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className="flex h-11 min-w-11 items-center gap-2 px-1 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-ink"
                    checked={(form.unavailableDays ?? []).includes(i)}
                    onChange={(e) => {
                      const cur = form.unavailableDays ?? [];
                      setForm({ ...form, unavailableDays: e.target.checked ? [...cur, i].sort() : cur.filter((x) => x !== i) });
                    }}
                  />
                  {d}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted text-pretty">Suggestions and the fill tools skip them on these weekdays. You can still schedule them, after a quick confirm. It never blocks printing.</p>
          </fieldset>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-3 size-5 accent-ink" checked={Boolean(form.noSuggest)} onChange={(e) => setForm({ ...form, noSuggest: e.target.checked || undefined })} />
            <span className="py-2">
              Don’t suggest this person
              <span className="block text-xs text-muted">Fill and Best fit skip them, for leave or a new start. You can still pick them by hand.</span>
            </span>
          </label>
          <div className="flex flex-col gap-2">
            <Label>Ink color</Label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, color: "" })}
                className={cn(
                  "h-11 rounded-full px-4 text-sm font-medium",
                  !form.color ? "bg-ink text-cream" : "bg-paper",
                )}
              >
                Auto
              </button>
              {PERSON_SWATCHES.map((hex, i) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Color ${i + 1}`}
                  aria-pressed={form.color === hex}
                  onClick={() => setForm({ ...form, color: hex })}
                  className="grid size-11 place-items-center rounded-full"
                >
                  <span
                    className={cn(
                      "size-8 rounded-full",
                      SWATCH_BG[i],
                      form.color === hex && "ring-2 ring-brand ring-offset-2 ring-offset-cream",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button type="submit">{editing ? "Save person" : "Add person"}</Button>
          <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
            Cancel
          </Button>
          {editing ? (
            <Button type="button" variant="ghost" className="ml-auto text-illegal" onClick={() => { const pp = doc.people.find((x) => x.name === editing); if (pp) void confirmRemove(pp); }}>
              Remove
            </Button>
          ) : null}
        </div>
      </form>
      </DialogContent>
      </Dialog>

      {bulkOpen ? (
        <section aria-label="Add several at once" className="surface hs-fade">
          <div className="flex items-center justify-between gap-2 px-5 pt-3">
            <h2 className="text-base font-semibold">Add several at once</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setBulkOpen(false)}>
              Close
            </Button>
          </div>
        <div className="flex flex-col gap-3 px-5 pb-5 pt-1">
          <p className="text-sm text-pretty text-muted">
            One pharmacist per line: name, home store, “float” if they float, then licensed states. You can paste from a spreadsheet. With no states listed, they’re licensed in their home store’s state.
          </p>
          <Textarea
            id="bulk-people"
            aria-label="Pharmacists to add, one per line"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={"Jane Smith, EST\nFenn Ritter, MOL, float, OR\nInes Calloway, WS, , WA OR"}
            className="font-mono"
          />
          {bulkProblems.length ? (
            <ul className="flex flex-col gap-1 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn" role="status">
              {bulkProblems.map((pr) => (
                <li key={pr.line}>
                  Line {pr.line}: {pr.why}. <span className="text-ink/70">{pr.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button
              type="button"
              variant="secondary"
              disabled={!bulk.trim()}
              onClick={() => {
                const { people, problems } = parsePeopleList(bulk, doc.stores, doc.people);
                setBulkProblems(problems);
                if (problems.length) setBulkOpen(true);
                const n = addPeople(people);
                if (n) {
                  announce(`Added ${n} ${n === 1 ? "pharmacist" : "pharmacists"}${problems.length ? `, skipped ${problems.length}` : ""}`);
                  setBulk(problems.length ? problems.map((pr) => pr.text).join("\n") : "");
                } else if (!problems.length) toast("Nothing to add");
              }}
            >
              Add them
            </Button>
          </div>
        </div>
        </section>
      ) : null}

      {noHome.length ? (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-bg/60 px-4 py-3 text-sm text-warn" role="status">
          {noHome.length} {noHome.length === 1 ? "pharmacist has" : "pharmacists have"} no home store, so suggestions can’t use drive time for them.
          <Button type="button" variant="secondary" size="sm" onClick={() => setHomeF(homeF === "none" ? "" : "none")}>
            {homeF === "none" ? "Show everyone" : "Show them"}
          </Button>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, role, home"
          aria-label="Search pharmacists"
          className="col-span-2 sm:max-w-xs"
        />
        <NativeSelect quiet aria-label="Role" className="sm:w-40" value={roleF} onChange={(e) => setRoleF(e.target.value as "" | Role)}>
          <option value="">All roles</option>
          <option value="Pharmacist">Pharmacist</option>
          <option value="Float Pharmacist">Float</option>
        </NativeSelect>
        <NativeSelect quiet aria-label="Home store" className="sm:w-44" value={homeF} onChange={(e) => setHomeF(e.target.value)}>
          <option value="">All home stores</option>
          {doc.stores.map((x) => (
            <option key={x.code} value={x.code}>
              {tag(x.code)} · {x.name}
            </option>
          ))}
          {noHome.length ? <option value="none">No home store ({noHome.length})</option> : null}
        </NativeSelect>
        <NativeSelect quiet aria-label="Sort by" className="col-span-2 sm:col-span-1 sm:w-40" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="role">Sort: role</option>
          <option value="name">Sort: name</option>
          <option value="home">Sort: home store</option>
          <option value="days">Sort: most days</option>
        </NativeSelect>
        {(q || roleF || homeF) ? (
          <span className="col-span-2 text-sm text-muted">
            {filtered.length} of {doc.people.length}
          </span>
        ) : null}
      </div>

      {doc.people.length === 0 ? (
        <EmptyState kind="people" title="No pharmacists yet" hint="Schedules are built from people and their home stores. Add them one at a time, or paste a list from a spreadsheet with “Add several”." />
      ) : null}

      <ul className="flex flex-col gap-2 md:hidden" aria-label="Pharmacists">
        {filtered.map((p) => (
          <li key={p.name} className="surface p-3">
            <div className="flex items-start justify-between gap-2">
              <Avatar name={p.name} color={p.color} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{p.name}</p>
                <p className="text-sm text-muted">
                  <span className="inline-flex items-center gap-2"><RoleMark float={p.role === "Float Pharmacist"} store={tag(p.home)} /> · {daysWorked(doc, p.name)} {daysWorked(doc, p.name) === 1 ? "day" : "days"}</span>
                </p>
                <p className="text-xs text-muted">
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <Mark icon="licensed" className="size-3.5" />
                      {p.licensedStates?.length ? p.licensedStates.join(", ") : "No states recorded"}
                    </span>
                    {p.unavailableDays?.length ? <UsualOffDots days={p.unavailableDays} /> : null}
                    {p.noSuggest ? <span>not suggested</span> : null}
                  </span>
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => startEdit(p)} aria-label={`Edit ${p.name}`}>
                Edit
              </Button>
            </div>
            {p.phone ? (
              <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium">
                <Phone className="size-4" />
                {p.phone}
              </a>
            ) : null}
          </li>
        ))}
      </ul>

      <div className={cn("hidden overflow-x-auto surface", doc.people.length > 0 && "md:block")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-paper text-left text-sm font-semibold text-ink">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Home</th>
              <th className="px-4 py-3">Licensed</th>
              <th className="px-4 py-3">Phone</th>
              <th className="relative px-4 py-3" title="Days scheduled this month">Days<span className="sr-only"> scheduled this month</span></th>
              <th className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.name} className="border-b border-line last:border-0">
                <td
                  className={cn("px-4 py-3 font-medium", personToneClass(p.name, p.color))}
                  style={p.color ? { color: personColorHex(p.name, p.color) } : undefined}
                >
                  <span className="flex items-center gap-2">
                    <Avatar name={p.name} color={p.color} className="size-7" />
                    {p.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center" title={p.role === "Float Pharmacist" ? "Float pharmacist | Based at a store, goes where cover is needed" : "Pharmacist | Works at their home store"}>
                    <Mark icon={p.role === "Float Pharmacist" ? "float" : "home"} tip={false} className="size-5" />
                    <span className="sr-only">{p.role === "Float Pharmacist" ? "Float pharmacist" : "Pharmacist"}</span>
                  </span>
                </td>
                <td className={cn("px-4 py-3", noHome.includes(p) && "font-semibold text-warn")}>{noHome.includes(p) ? "No home" : tag(p.home)}</td>
                <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                  <span className="inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      {p.licensedStates?.length ? <Mark icon="licensed" className="size-3.5" /> : null}
                      {p.licensedStates?.length ? p.licensedStates.join(", ") : "—"}
                    </span>
                    {p.unavailableDays?.length ? <UsualOffDots days={p.unavailableDays} /> : null}
                    {p.noSuggest ? <span>not suggested</span> : null}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.phone ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center whitespace-nowrap text-left"
                      onClick={() => {
                        void navigator.clipboard?.writeText(p.phone);
                        toast.success("Copied phone");
                      }}
                    >
                      <Phone aria-hidden className="mr-2 size-3.5 shrink-0 text-muted" />
                      {p.phone}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="group/wb flex w-28 items-center gap-2">
                    <span className="w-6 shrink-0 text-right tabular-nums">{daysWorked(doc, p.name)}</span>
                    <WorkBar className="min-w-0 flex-1" days={daysWorked(doc, p.name)} saturdays={saturdaysWorked(doc, p.name)} max={maxPersonDays} />
                  </span>
                </td>
                <td className="px-4 py-1 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => startEdit(p)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${p.name}`} title="Remove" className="text-muted hover:bg-illegal-bg hover:text-illegal" onClick={() => confirmRemove(p)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** The week as seven small marks: a moon on each usual day off. */
function UsualOffDots({ days }: { days: number[] }) {
  return (
    <span role="img" aria-label={`Usually off ${days.map((d) => WEEKDAYS[d]).join(", ")}`} title={`Usually off ${days.map((d) => WEEKDAYS[d]).join(", ")}`} className="inline-flex items-center gap-0.5">
      {["S", "M", "T", "W", "T", "F", "S"].map((l, i) => (
        <span key={i} aria-hidden className={cn("inline-flex size-4 items-center justify-center rounded-full text-[0px]", days.includes(i) ? "bg-night text-cream" : "bg-line")}>
          {days.includes(i) ? <Mark icon="usualOff" tip={false} className="size-2.5" /> : l}
        </span>
      ))}
    </span>
  );
}
