// "Who could be called" for one store on one day: the domain's ranking, each with reason words and a button that places them (one change, with Undo).
import { useMemo, useState } from "react";
import type { DomainState, ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { fmtDate } from "../../copy.ts";
import { shortName } from "../../names.ts";
import { Btn } from "../../ui/primitives.tsx";
import { callers } from "./calc.ts";

const FIRST = 3;

export function Cover({ state, storeId, date, exclude = [], locked }: { state: DomainState; storeId: string; date: ISODate; exclude?: string[]; locked: boolean }) {
  const asOf = useApp((s) => s.asOf);
  const [all, setAll] = useState(false);
  const list = useMemo(() => callers(state, storeId, date, asOf, exclude), [state, storeId, date, asOf, exclude.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const code = state.stores[storeId]?.code ?? storeId;
  if (!list.length) return <p className="text-sm text-muted">Nobody is free to cover {code} that day.</p>;
  const shown = all ? list : list.slice(0, FIRST);
  return (
    <div data-cover={`${storeId}|${date}`}>
      <ul aria-label={`Could cover ${code}`} className="divide-y divide-line/70">
        {shown.map((c) => {
          const who = state.pharmacists[c.pharmacistId]?.name ?? c.pharmacistId;
          const verb = c.edit.t === "move" ? "Move here" : "Place";
          return (
            <li key={c.pharmacistId} data-caller={c.pharmacistId} className="flex items-start justify-between gap-3 py-1.5">
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium" title={who}>{shortName(who, 28)}</div>
                <div className="text-xs text-muted">{c.good.join(" · ")}</div>
                {c.caution.length > 0 && <div className="text-xs text-warn">▲ {c.caution.join(" · ")}</div>}
              </div>
              <Btn aria-label={`${verb}: ${who} at ${code}, ${fmtDate(date)}`} disabled={locked} className="shrink-0"
                onClick={() => useApp.getState().commit([c.edit], `${c.edit.t === "move" ? "Moved" : "Scheduled"} ${shortName(who, 22)} at ${code} on ${fmtDate(date)}.`)}>
                {verb}
              </Btn>
            </li>
          );
        })}
      </ul>
      {list.length > FIRST && <button type="button" onClick={() => setAll(!all)} className="mt-1 text-xs text-muted underline focus-visible:outline-2 focus-visible:outline-ink">{all ? "Show fewer" : `Show all ${list.length}`}</button>}
    </div>
  );
}
