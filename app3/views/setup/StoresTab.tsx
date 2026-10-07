// Setup > Stores. One quiet row per store: the weekdays it needs staff (with the number), its month as one thin line, and the longest stretch
// one pharmacist stayed. Stores are never deleted: history refers to them. Each change is a change set with Undo.
import { useMemo, useState } from "react";
import { monthDates, monthOf, type DomainState, type ISODate, type Store } from "@domain";
import { useApp } from "../../store.ts";
import { evaluateCached, useViewState } from "../../derive.ts";
import { Btn, Chip, cx } from "../../ui/primitives.tsx";
import { HexBadge, type HexStatus } from "../../ui/HexBadge.tsx";
import { shortName } from "../../names.ts";
import { TipButton } from "../chrome/Title.tsx";
import { DriveTimesHelper } from "./DriveTimesHelper.tsx";
import { StoreEditor } from "./StoreEditor.tsx";
import { ListMenu, MonthLine, WeekdayLetters } from "./parts.tsx";
import { DAY_LONG, DAY_SHORT, MON_FIRST, dayLabel, indexByCell, monthDay, storeActiveOn, storeMonth, storesByCode, storesList, weeklyNeed, type StoreMonth } from "./lib.ts";
import { niceDate, useLocked } from "./shared.tsx";

const COLS = "grid-cols-[minmax(13rem,1.3fr)_10.5rem_minmax(14rem,1.4fr)_4.5rem]";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const KEY_TIP = "A store's month | One thin line per store, one tick for each day | Tall red: someone is missing | Tall amber: a rule is broken | Medium green: covered | Short grey: closed | Weekday squares show how many pharmacists the store needs";

function statusOf(st: Store, asOf: ISODate): { tone: "warning" | "neutral"; text: string } | null {
  if (st.inactiveFrom && st.inactiveFrom <= asOf) return { tone: "neutral", text: `Closed since ${niceDate(st.inactiveFrom)}` };
  if (st.activeFrom && st.activeFrom > asOf) return { tone: "warning", text: `Opens ${niceDate(st.activeFrom)}` };
  if (st.inactiveFrom) return { tone: "warning", text: `Closes ${niceDate(st.inactiveFrom)}` };
  return null;
}

export function StoresTab() {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const win = useApp((s) => s.window);
  const vs = useViewState();
  const locked = useLocked();
  const [editing, setEditing] = useState<string | null>(null); // store id, "new", or null
  const [helperFor, setHelperFor] = useState<string | null>(null);
  const [helperOpen, setHelperOpen] = useState(false);
  const st = world.state;
  const stores = useMemo(() => storesByCode(st), [st]);

  const month = monthOf(win.from);
  const dates = useMemo(() => monthDates(month), [month]);
  const months = useMemo(() => {
    const state = vs?.state ?? st;
    const ev = evaluateCached(state, asOf, { range: { from: dates[0]!, to: dates[dates.length - 1]! }, ...(vs?.scenario ? { includeRequested: true } : {}) });
    const byCell = indexByCell(state);
    return new Map(stores.map((s) => [s.id, storeMonth(ev, s.id, dates, byCell)] as const));
  }, [vs, st, asOf, dates, stores]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex-1" />
        <TipButton title="Stores" tip={KEY_TIP} />
        <ListMenu name="stores" build={() => storesList(st, asOf)} />
        <Btn tone="ink" className="shrink-0 whitespace-nowrap" disabled={!!locked || editing === "new"} onClick={() => setEditing("new")}>Add a store</Btn>
      </div>

      {editing === "new" && (
        <StoreEditor key="new" onDone={(newId) => { setEditing(null); if (newId) { setHelperFor(newId); setHelperOpen(true); } }} />
      )}

      <DriveTimesHelper open={helperOpen} onOpen={setHelperOpen} focusStoreId={helperFor} />

      <div className="rounded-md bg-white ring-1 ring-line">
        <div aria-hidden className={cx("grid items-end gap-x-4 border-b border-line px-3 pb-1 pt-2 text-xs font-semibold text-muted", COLS)}>
          <span />
          <WeekdayLetters />
          <span>{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</span>
          <span />
        </div>
        <ul aria-label="Stores" className="divide-y divide-line/60">
          {stores.length === 0 && <li className="px-3 py-4 text-sm text-muted">No stores yet. Use "Add a store" to start.</li>}
          {stores.map((s) => (
            <li key={s.id} data-store-row={s.code}>
              <Row store={s} state={st} asOf={asOf} month={months.get(s.id)!} monthName={MONTHS[Number(month.slice(5)) - 1]!} locked={!!locked} editing={editing === s.id} onEdit={() => setEditing(s.id)} />
              {editing === s.id && <div className="border-t border-line bg-paper p-3"><StoreEditor store={s} onDone={() => setEditing(null)} /></div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ store, state, asOf, month, monthName, locked, editing, onEdit }: { store: Store; state: DomainState; asOf: ISODate; month: StoreMonth; monthName: string; locked: boolean; editing: boolean; onEdit: () => void }) {
  const status = statusOf(store, asOf);
  const { counts, longest } = month;
  const trouble = counts.open + counts.broken;
  const hex: HexStatus = !storeActiveOn(store, asOf) ? "closed" : trouble > 0 ? "fix" : "ok";
  const summary = `${monthName}: ${counts.covered} ${counts.covered === 1 ? "day" : "days"} covered${counts.open ? `, ${counts.open} with someone missing` : ""}${counts.broken ? `, ${counts.broken} with a rule broken` : ""}${counts.closed ? `, ${counts.closed} closed` : ""}`;
  const tipLines = [
    store.name,
    counts.covered ? `Covered: ${counts.covered}` : "",
    counts.open ? `Someone missing: ${month.ticks.filter((t) => t.open).slice(0, 6).map((t) => dayLabel(t.date)).join(", ")}${counts.open > 6 ? ` and ${counts.open - 6} more` : ""}` : "",
    counts.broken ? `Rule broken: ${month.ticks.filter((t) => t.broken && !t.open).slice(0, 6).map((t) => dayLabel(t.date)).join(", ")}${counts.broken > 6 ? " and more" : ""}` : "",
  ].filter(Boolean);
  const ph = longest ? state.pharmacists[longest.pharmacistId] : undefined;
  return (
    <div className={cx("grid items-center gap-x-4 px-3 py-2", COLS)}>
      <div className="flex min-w-0 items-center gap-3">
        <HexBadge label={store.code} size={30} status={hex} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{store.name} {status && <Chip tone={status.tone} className="ml-1 whitespace-nowrap align-middle">{status.text}</Chip>}</p>
          <p className="truncate text-xs text-muted">{store.state ?? "State not recorded"}</p>
        </div>
      </div>
      <NeedMarks state={state} store={store} date={asOf} />
      <div className="flex min-w-0 flex-col gap-1">
        <MonthLine label={store.code} ticks={month.ticks} summary={summary} tip={tipLines.join(" | ")} />
        <p className="truncate text-xs text-muted" data-run={longest?.days ?? 0} data-tip={ph && longest ? `Longest stay | ${ph.name}, ${longest.days} open days in a row | ${monthDay(longest.from)} to ${monthDay(longest.to)}` : undefined}>
          {ph && longest && longest.days > 1 ? `${shortName(ph.name, 18)} · ${longest.days} in a row` : " "}
        </p>
      </div>
      <div className="text-right"><Btn tone="ghost" aria-label={`Edit store ${store.code}`} aria-expanded={editing} disabled={editing || locked} onClick={onEdit}>Edit</Btn></div>
    </div>
  );
}

/** Seven squares, Monday first: the number of pharmacists the store needs that weekday, or a quiet dash when it is closed. */
function NeedMarks({ state, store, date }: { state: DomainState; store: Store; date: ISODate }) {
  const needs = MON_FIRST.map((w) => weeklyNeed(state, store.id, w, date));
  const words = MON_FIRST.map((w, i) => `${DAY_SHORT[w]} ${needs[i] === 0 ? "closed" : needs[i]}`).join(", ");
  return (
    <span role="img" aria-label={`${store.code} needs: ${words}`} className="inline-flex" data-need-marks>
      {MON_FIRST.map((w, i) => {
        const n = needs[i]!;
        return (
          <span key={w} data-need={n} data-weekday={DAY_SHORT[w]} data-tip={`${DAY_LONG[w]} | ${n === 0 ? "Closed" : `Needs ${n}`}`}
            className={cx("grid size-6 place-items-center text-xs", n === 0 ? "text-muted/70" : "bg-ok-bg font-semibold text-ink")}>
            {n === 0 ? <span aria-hidden>–</span> : n}
          </span>
        );
      })}
    </span>
  );
}
