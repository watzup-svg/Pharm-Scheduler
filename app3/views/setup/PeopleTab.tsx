// Setup > People. One quiet row per pharmacist: their week as seven marks, this month's days and longest run, licences, and what they usually work.
// The form to change someone opens under their row. Nothing here places anyone; every change is a change set with Undo.
import { useMemo, useState } from "react";
import { addDays, type DomainState, type ISODate, type Pharmacist } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, Chip, GLYPH, cx } from "../../ui/primitives.tsx";
import { HexBadge } from "../../ui/HexBadge.tsx";
import { TipButton } from "../chrome/Title.tsx";
import { PharmacistEditor } from "./PharmacistEditor.tsx";
import { ListMenu, Segmented, WeekMarks, WeekdayLetters } from "./parts.tsx";
import {
  fullDate, indexByPerson, mondayOf, monthDay, monthOfWeek, weekLabel, peopleList, personRow, pharmacistsByName, type PersonRow,
} from "./lib.ts";
import { niceDate, useLocked } from "./shared.tsx";

const COLS = "grid-cols-[minmax(12rem,1.4fr)_10.5rem_7.5rem_minmax(9rem,1fr)_4.5rem]";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const KEY_TIP = "Their week | A small dark square: at their own store | Green route: covering another store | Palm: time off | Clock: a request waiting | Twice: in two places on one day";

function statusChip(p: Pharmacist, asOf: ISODate) {
  if (p.inactiveFrom && p.inactiveFrom <= asOf) return { tone: "neutral" as const, text: `Left ${niceDate(p.inactiveFrom)}` };
  if (p.activeFrom && p.activeFrom > asOf) return { tone: "warning" as const, text: `Starts ${niceDate(p.activeFrom)}` };
  if (p.inactiveFrom) return { tone: "warning" as const, text: `Leaves ${niceDate(p.inactiveFrom)}` };
  return null;
}

export function PeopleTab() {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const locked = useLocked();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [storeId, setStoreId] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const [weeks, setWeeks] = useState(0);
  const st = world.state;

  const monday = addDays(mondayOf(asOf), weeks * 7);
  const month = monthOfWeek(monday);
  const idx = useMemo(() => indexByPerson(st), [st]);
  const all = useMemo(() => pharmacistsByName(st), [st]);
  const rows = useMemo(
    () => all.filter((p) => showLeft || !(p.inactiveFrom && p.inactiveFrom <= asOf)).filter((p) => !storeId || p.baseStoreId === storeId).map((p) => personRow(st, p, monday, asOf, idx)),
    [all, st, monday, asOf, idx, showLeft, storeId],
  );
  const needing = rows.filter((r) => r.attention.length > 0).length;
  const shown = filter === "attention" ? rows.filter((r) => r.attention.length > 0) : rows;
  const stores = useMemo(() => [...new Set(all.map((p) => p.baseStoreId).filter((x): x is string => !!x))].map((id) => st.stores[id]).filter(Boolean).sort((a, b) => (a!.code < b!.code ? -1 : 1)), [all, st.stores]);
  const hasLeft = all.some((p) => p.inactiveFrom && p.inactiveFrom <= asOf);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "Everyone" }, { value: "attention", label: `Needs a look${needing ? ` (${needing})` : ""}`, aria: `Needs a look, ${needing}` }]} />
        {stores.length > 1 && (
          <label className="flex items-center gap-1.5 text-sm text-muted">Store
            <select aria-label="Base store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className="h-8 rounded-md border border-edge bg-white pl-2 pr-6 text-sm text-ink focus-visible:outline-2 focus-visible:outline-ink">
              <option value="">All</option>
              {stores.map((s) => <option key={s!.id} value={s!.id}>{s!.code}</option>)}
            </select>
          </label>
        )}
        {hasLeft && <label className="flex h-8 items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> Show people who left</label>}
        <span className="flex-1" />
        <div role="group" aria-label="Week shown" className="flex items-center gap-1">
          <Btn tone="ghost" className="w-8 px-0" aria-label="Previous week" onClick={() => setWeeks((w) => w - 1)}>‹</Btn>
          <span className="min-w-28 text-center text-sm font-medium" data-testid="week-label">{weekLabel(monday)}</span>
          <Btn tone="ghost" className="w-8 px-0" aria-label="Next week" onClick={() => setWeeks((w) => w + 1)}>›</Btn>
        </div>
        <TipButton title="People" tip={KEY_TIP} />
        <ListMenu name="people" build={() => peopleList(st, asOf, showLeft)} />
        <Btn tone="ink" className="shrink-0 whitespace-nowrap" disabled={!!locked || editing === "new"} onClick={() => setEditing("new")}>Add a pharmacist</Btn>
      </div>

      {editing === "new" && <PharmacistEditor key="new" onDone={() => setEditing(null)} />}

      <div className="rounded-md bg-white ring-1 ring-line">
        <div aria-hidden className={cx("grid items-end gap-x-4 border-b border-line px-3 pb-1 pt-2 text-xs font-semibold text-muted", COLS)}>
          <span />
          <WeekdayLetters />
          <span>{MONTHS[Number(month.slice(5)) - 1]}</span>
          <span>Licences</span>
          <span />
        </div>
        <ul aria-label="Pharmacists" className="divide-y divide-line/60">
          {shown.length === 0 && <li className="px-3 py-4 text-sm text-muted">{all.length === 0 ? "No pharmacists yet. Use \"Add a pharmacist\" to start." : filter === "attention" ? "Nobody needs a look." : "Nobody matches."}</li>}
          {shown.map((r) => (
            <li key={r.p.id} data-pharmacist-row={r.p.name} data-attention={r.attention.length ? "yes" : "no"}>
              <Row r={r} asOf={asOf} st={st} locked={!!locked} editing={editing === r.p.id} onEdit={() => setEditing(r.p.id)} />
              {editing === r.p.id && <div className="border-t border-line bg-paper p-3"><PharmacistEditor pharmacist={r.p} onDone={() => setEditing(null)} /></div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ r, asOf, st, locked, editing, onEdit }: { r: PersonRow; asOf: ISODate; st: DomainState; locked: boolean; editing: boolean; onEdit: () => void }) {
  const { p } = r;
  const base = p.baseStoreId ? st.stores[p.baseStoreId] : undefined;
  const status = statusChip(p, asOf);
  const over = r.overRunLimit;
  return (
    <div className={cx("grid items-center gap-x-4 px-3 py-2", COLS)}>
      <div className="flex min-w-0 items-center gap-3">
        <span data-tip={base ? `Base store | ${base.code}, ${base.name}` : "Base store | None"} className="w-9 shrink-0">
          {base ? <HexBadge label={base.code} size={28} /> : <span className="grid h-7 place-items-center text-muted" role="img" aria-label="No base store">–</span>}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.name} {status && <Chip tone={status.tone} className="ml-1 whitespace-nowrap align-middle">{status.text}</Chip>}</p>
          <p className="truncate text-xs text-muted" data-tip={r.standing.length ? `Usually works | ${r.standing.join(" | ")}` : undefined}>{r.standing.length ? r.standing.join(" · ") : "No usual days"}</p>
        </div>
      </div>
      <WeekMarks name={p.name} days={r.week} />
      <div data-tip={`${r.month.days} ${r.month.days === 1 ? "day" : "days"} placed this month${r.month.longest ? ` | Longest stretch: ${r.month.longest} in a row, ${monthDay(r.month.from!)} to ${monthDay(r.month.to!)}` : ""}${over ? ` | Over the limit of ${st.config.maxConsecutiveDays} in a row` : ""}`}>
        <p className="leading-5"><span className="text-lg font-semibold tabular-nums" data-days>{r.month.days}</span> <span className="text-xs text-muted">{r.month.days === 1 ? "day" : "days"}</span></p>
        <p className={cx("text-xs tabular-nums", over ? "font-semibold text-warn" : "text-muted")} data-run={r.month.longest}>{r.month.longest > 1 ? `${over ? `${GLYPH.warning} ` : ""}${r.month.longest} in a row` : " "}</p>
      </div>
      <LicenceCell r={r} />
      <div className="text-right"><Btn aria-label={`Edit ${p.name}`} tone="ghost" disabled={editing || locked} aria-expanded={editing} onClick={onEdit}>Edit</Btn></div>
    </div>
  );
}

function LicenceCell({ r }: { r: PersonRow }) {
  const { licence } = r;
  if (!licence.recorded) return <span><Chip tone="warning" title="Counted at any store, but flagged as unverified">{GLYPH.warning} Not recorded</Chip></span>;
  if (licence.items.length === 0) return <span><Chip tone="warning">{GLYPH.warning} No licence</Chip></span>;
  const tip = licence.items.map((i) => `${i.state}: ${i.until ? `valid through ${fullDate(i.until)}` : "no end date"}`).join(" | ");
  return (
    <span className="flex flex-wrap items-center gap-1 text-sm" data-tip={`Licences | ${tip}`}>
      {licence.items.map((i) =>
        i.status === "ok" ? <span key={i.state} className="text-muted" data-licence={`${i.state}:ok`}>{i.state}</span>
          : i.status === "expiring" ? <Chip key={i.state} tone="warning" className="whitespace-nowrap">{GLYPH.warning} {i.state} ends {monthDay(i.until!)}</Chip>
            : <Chip key={i.state} tone="serious" className="whitespace-nowrap">{GLYPH.serious} {i.state} ended {monthDay(i.until!)}</Chip>,
      )}
    </span>
  );
}
