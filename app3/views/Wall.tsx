// The schedule wall: rows x dates over the window. Read-only while a proposal or a what-if is open.
import "./wall/wall.css";
import { useMemo } from "react";
import { useApp } from "../store.ts";
import { useEvaluation, useGhosts, useViewState, useWindowDates } from "../derive.ts";
import { Controls } from "./wall/Controls.tsx";
import { Grid, type RowDef } from "./wall/Grid.tsx";
import { DayView } from "./wall/DayView.tsx";
import { useWallUi } from "./wall/ui.ts";
import { HexBadge } from "../ui/HexBadge.tsx";
import { shortName } from "../names.ts";
import {
  activePharmacists, activeStores, buildPharmacistModels, buildStoreModels, indexByCell, indexByPharmacist, openByStore, rowStatus,
} from "./wall/model.ts";

/** A stable colour for a person: one of the eight palette tokens, by a hash of the id. */
function paletteVar(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `var(--color-p${h % 8})`;
}

export function Wall() {
  const world = useApp((s) => s.world);
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const axis = useApp((s) => s.axis);
  const vs = useViewState();
  const ev = useEvaluation();
  const ghosts = useGhosts();
  const dates = useWindowDates();
  const day = useWallUi((s) => s.day);

  const proposal = !!world?.session.proposal;
  const scenario = !!vs?.scenario;
  const readOnly = proposal || scenario;

  const rows = useMemo<RowDef[]>(() => {
    if (!vs || !ev || day) return [];
    const { state } = vs;
    if (axis === "store") {
      const stores = activeStores(state, win);
      const models = buildStoreModels(state, ev, stores, dates, asOf, indexByCell(state), ghosts, readOnly);
      const opens = openByStore(ev, stores, win, asOf);
      return stores.map((s, i) => {
        const n = opens.get(s.id) ?? 0;
        const status = rowStatus(models[i]!, asOf);
        return {
          key: s.id,
          label: `${s.code} ${s.name}${n ? `, ${n} open` : ""}`,
          tip: `${s.code} · ${s.name} | ${n ? `${n} ${n === 1 ? "needs" : "need"} more this month` : status === "closed" ? "Closed this month" : "Covered this month"}`,
          // The dot only appears when something in the window still needs fixing.
          head: <HexBadge label={s.code} status={status === "fix" ? "fix" : status === "closed" ? "closed" : "none"} size={26} className="pointer-events-none" />,
          cells: models[i]!,
        };
      });
    }
    const people = activePharmacists(state, win);
    const byPD = indexByPharmacist(state);
    const models = buildPharmacistModels(state, ev, people, dates, asOf, byPD, ghosts, vs.scenario);
    // Days in view per person, counted once for everyone from the one index.
    const daysIn = new Map<string, number>();
    for (const p of people) {
      let n = 0;
      for (const d of dates) if (byPD.has(`${p.id}|${d}`)) n++;
      daysIn.set(p.id, n);
    }
    return people.map((p, i) => {
      const days = daysIn.get(p.id) ?? 0;
      return {
        key: p.id,
        label: `${p.name}, ${days} days in view`,
        tip: `${p.name} | ${days} ${days === 1 ? "day" : "days"} in view`,
        head: (
          <span className="w-person">
            <span className="w-disc" aria-hidden="true" style={{ background: paletteVar(p.id) }} />
            <span className="w-pname">{shortName(p.name, 12)}</span>
          </span>
        ),
        cells: models[i]!,
      };
    });
  }, [vs, ev, axis, win, dates, asOf, ghosts, readOnly, day]);

  if (!world || !vs || !ev) return null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      <Controls preview={proposal} whatIf={scenario} ghosts={ghosts.size > 0} />
      <div className="w-scroll">
        {day ? <DayView date={day} /> : <Grid
          rows={rows}
          dates={dates}
          axis={axis}
          asOf={asOf}
          corner={axis === "store" ? "Stores" : "People"}
          ariaLabel={axis === "store" ? "Schedule by store" : "Schedule by pharmacist"}
        />}
      </div>
    </div>
  );
}
