// The schedule wall: rows x dates over the window. Read-only while a proposal or a what-if is open.
import "./wall/wall.css";
import { useMemo } from "react";
import { useApp } from "../store.ts";
import { useEvaluation, useGhosts, useViewState, useWindowDates } from "../derive.ts";
import { Controls } from "./wall/Controls.tsx";
import { Grid, type RowDef } from "./wall/Grid.tsx";
import {
  activePharmacists, activeStores, buildPharmacistModels, buildStoreModels, indexByCell, indexByPharmacist, openByStore, shortName,
} from "./wall/model.ts";

export function Wall() {
  const world = useApp((s) => s.world);
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const axis = useApp((s) => s.axis);
  const vs = useViewState();
  const ev = useEvaluation();
  const ghosts = useGhosts();
  const dates = useWindowDates();

  const proposal = !!world?.session.proposal;
  const scenario = !!vs?.scenario;
  const readOnly = proposal || scenario;

  const rows = useMemo<RowDef[]>(() => {
    if (!vs || !ev) return [];
    const { state } = vs;
    if (axis === "store") {
      const stores = activeStores(state, win);
      const models = buildStoreModels(state, ev, stores, dates, asOf, indexByCell(state), ghosts, readOnly);
      const opens = openByStore(ev, stores, win, asOf);
      return stores.map((s, i) => {
        const n = opens.get(s.id) ?? 0;
        return {
          key: s.id,
          label: `${s.code} ${s.name}${n ? `, ${n} open` : ""}`,
          head: (
            <>
              <span className="w-l1"><b>{s.code}</b>{n > 0 && <span className="w-count" aria-hidden="true" title={`${n} open from today on`}>{"□"}{n}</span>}</span>
              <span className="w-l2" title={s.name}>{s.name}</span>
            </>
          ),
          cells: models[i]!,
        };
      });
    }
    const people = activePharmacists(state, win);
    const models = buildPharmacistModels(state, ev, people, dates, asOf, indexByPharmacist(state), ghosts, vs.scenario);
    return people.map((p, i) => {
      const days = new Set(Object.values(state.assignments).filter((a) => a.pharmacistId === p.id && a.date >= win.from && a.date <= win.to).map((a) => a.date)).size;
      return {
        key: p.id,
        label: `${p.name}, ${days} days in view`,
        head: (
          <>
            <span className="w-l1"><b title={p.name}>{shortName(p.name, 13)}</b></span>
            <span className="w-l2">{p.initials} {"·"} {days} {days === 1 ? "day" : "days"}</span>
          </>
        ),
        cells: models[i]!,
      };
    });
  }, [vs, ev, axis, win, dates, asOf, ghosts, readOnly]);

  if (!world || !vs || !ev) return null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      <Controls preview={proposal} whatIf={scenario} ghosts={ghosts.size > 0} />
      <div className="w-scroll">
        <Grid
          rows={rows}
          dates={dates}
          axis={axis}
          asOf={asOf}
          corner={axis === "store" ? "Stores" : "Pharmacists"}
          ariaLabel={axis === "store" ? "Schedule by store" : "Schedule by pharmacist"}
        />
      </div>
    </div>
  );
}
