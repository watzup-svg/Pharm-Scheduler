// One date, every store: a big green or pink tile each, with the people's full names and, where cover is needed, who could be called.
// Same colours and pictures as the grid (they come from the same cell model). A tile opens the Inspector.
import { useMemo } from "react";
import { cmp, judgeChoice, prepareChoices, type Choice, type DomainState, type ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { evaluateCached, useGhosts, useViewState } from "../../derive.ts";
import { BlockMark } from "../../ui/icons.tsx";
import { HexBadge } from "../../ui/HexBadge.tsx";
import { cx } from "../../ui/primitives.tsx";
import { activeStores, buildStoreModels, indexByCell, type CellModel } from "./model.ts";
import { DOW_LONG, MONTH_LONG, dayNum, monthIndex } from "./model.ts";
import { weekday } from "@domain";

const CALL_SHOWN = 4;

/** People free on `date` who would count at `storeId`, best first (the order the Inspector uses: fewest warnings, then nearest). */
export function couldCall(state: DomainState, date: ISODate, asOf: ISODate, storeIds: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!storeIds.length) return out;
  const cb = prepareChoices(state, date, asOf);
  const ids = Object.keys(state.pharmacists).sort(cmp);
  for (const sid of storeIds) {
    const list: Choice[] = [];
    for (const id of ids) {
      const c = judgeChoice(cb, id, sid);
      if (c && c.currently === "off" && c.counts && !c.unavailable) list.push(c);
    }
    list.sort((a, b) => a.warns.length * 10 + a.unknown.length - (b.warns.length * 10 + b.unknown.length) || (a.travelMinutes ?? 9999) - (b.travelMinutes ?? 9999) || cmp(a.pharmacistId, b.pharmacistId));
    out.set(sid, list.map((c) => state.pharmacists[c.pharmacistId]?.name ?? c.pharmacistId));
  }
  return out;
}

export function DayView({ date }: { date: ISODate }) {
  const vs = useViewState();
  const asOf = useApp((s) => s.asOf);
  const sel = useApp((s) => s.selection);
  const ghosts = useGhosts();
  const data = useMemo(() => {
    if (!vs) return null;
    const ev = evaluateCached(vs.state, asOf, { range: { from: date, to: date }, includeRequested: vs.scenario });
    const stores = activeStores(vs.state, { from: date, to: date });
    const models = buildStoreModels(vs.state, ev, stores, [date], asOf, indexByCell(vs.state), ghosts, true).map((r) => r[0]!);
    const needy = date < asOf ? [] : models.filter((m) => m.block === "open").map((m) => m.storeId!);
    return { stores, models, call: couldCall(vs.state, date, asOf, needy) };
  }, [vs, date, asOf, ghosts]);
  if (!vs || !data) return null;
  const order = (m: CellModel) => (m.block === "open" ? 0 : m.block === "closed" ? 2 : 1);
  const tiles = data.models.map((m, i) => ({ m, store: data.stores[i]! })).sort((a, b) => order(a.m) - order(b.m));
  return (
    <section aria-label="One day" className="d-wrap">
      <h2 className="d-title">{DOW_LONG[weekday(date)]}, {MONTH_LONG[monthIndex(date)]} {dayNum(date)}</h2>
      <ul className="d-grid">
        {tiles.map(({ m, store }) => {
          const call = data.call.get(store.id) ?? [];
          const tip = call.length ? `${m.tip} | Could call: ${call.join(", ")}` : m.tip;
          const on = sel?.storeId === store.id && sel.date === date;
          return (
            <li key={store.id}>
              <button
                type="button"
                className={cx("d-tile", (m.past || m.faded) && "d-past", on && "d-sel", m.block === "closed" && "hatch")}
                data-block={m.block}
                data-sev={m.iconTone ?? undefined}
                data-icon={m.chip ?? undefined}
                data-store={store.id}
                aria-pressed={on}
                aria-label={m.label + (call.length ? `, you could call ${call.join(", ")}` : "")}
                data-tip={tip}
                data-tip-list=""
                data-tip-tone={m.tone === "plain" ? undefined : m.tone}
                data-tip-mark={m.chip ?? undefined}
                onClick={() => useApp.getState().select({ storeId: store.id, date })}
              >
                <span className="d-head">
                  <HexBadge label={store.code} size={26} className="pointer-events-none" />
                  <span className="d-store">{store.name}</span>
                  {m.chip && <BlockMark kind={m.chip} tone={m.iconTone ?? undefined} n={m.chipN} size={24} className={m.faded ? "ml-auto opacity-60" : "ml-auto"} />}
                </span>
                {m.names.length > 0 && <span className="d-names">{m.names.map((n) => <span key={n}>{n}</span>)}</span>}
                {m.reason && m.block !== "closed" && <span className="d-reason">{m.reason}</span>}
                {call.length > 0 && (
                  <span className="d-call">
                    <b>You could call</b> {call.slice(0, CALL_SHOWN).join(", ")}{call.length > CALL_SHOWN ? ` and ${call.length - CALL_SHOWN} more` : ""}
                  </span>
                )}
                {m.block === "open" && !call.length && !m.past && <span className="d-call">Nobody is free to call</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
