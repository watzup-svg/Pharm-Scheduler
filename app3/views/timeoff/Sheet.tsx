// The Time off sheet: pharmacists down the side, days across. Same grid as the Schedule, so the keyboard, the window and the selection behave the same.
import "../wall/wall.css";
import { useMemo, useState } from "react";
import type { ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { useViewState, useWindowDates } from "../../derive.ts";
import { shortName } from "../../names.ts";
import { paletteVar } from "../../ui/PersonDisc.tsx";
import { Grid, type RowDef } from "../wall/Grid.tsx";
import { Swatch, TIMEOFF_COLOURS } from "../wall/Key.tsx";
import { activePharmacists, indexByPharmacist, widthKind, windowFor, type WidthKind } from "../wall/model.ts";
import { buildSheetRows, indexRecords, kindOf } from "./sheet.ts";
import { useTimeOffUi } from "./ui.ts";
import { useWhyLocked } from "./lib.ts";

const WIDTHS: { kind: Exclude<WidthKind, "custom" | "4w">; label: string }[] = [{ kind: "month", label: "Month" }, { kind: "2w", label: "2 weeks" }];



function Controls() {
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const filter = useTimeOffUi((s) => s.filter);
  const kind = widthKind(win);
  const [key, setKey] = useState(false);
  const locked = !!useWhyLocked();
  const show = (k: Exclude<WidthKind, "custom" | "4w">) => { const x = windowFor(k, asOf >= win.from && asOf <= win.to ? asOf : win.from); useApp.getState().setWindow(x.from, x.to); };
  const goToday = () => {
    const k: Exclude<WidthKind, "custom"> = kind === "custom" ? "2w" : kind;
    if (asOf < win.from || asOf > win.to) { const x = windowFor(k, asOf); useApp.getState().setWindow(x.from, x.to); }
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".w-asof-head")?.scrollIntoView({ inline: "center", block: "nearest" }));
  };
  return (
    <div className="relative shrink-0">
      <div className="w-controls flex items-center gap-x-3 border-b border-line bg-cream px-3 py-1">
        <div className="flex items-center gap-1" role="group" aria-label="Move the window">
          <button type="button" className="w-btn" onClick={() => useApp.getState().shiftWindow(-7)} aria-label="Previous week">{"‹"}</button>
          <button type="button" className="w-btn" onClick={goToday}>Today</button>
          <button type="button" className="w-btn" onClick={() => useApp.getState().shiftWindow(7)} aria-label="Next week">{"›"}</button>
        </div>
        <div className="w-seg" role="group" aria-label="How much to show">
          {WIDTHS.map((w) => <button key={w.kind} type="button" aria-pressed={kind === w.kind} onClick={() => show(w.kind)}>{w.label}</button>)}
        </div>
        <input type="search" aria-label="Find a person" placeholder="Find a person" value={filter} onChange={(e) => useTimeOffUi.getState().setFilter(e.target.value)}
          className="h-8 w-40 rounded-md border border-edge bg-white px-2 text-sm" />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="w-btn whitespace-nowrap" disabled={locked} onClick={() => useTimeOffUi.getState().openAdd("add", useApp.getState().selection?.date, useApp.getState().selection?.pharmacistId)}>Add time off</button>
          <button type="button" className="w-btn" aria-expanded={key} aria-controls="sheet-key" onClick={() => setKey((k) => !k)}>Key</button>
        </div>
      </div>
      {key && (
        <div id="sheet-key" role="region" aria-label="Key" className="w-keypanel">
          <div className="flex flex-col gap-1.5">
            {TIMEOFF_COLOURS.map((l) => <div key={l.name} className="w-key-item"><Swatch block={l.block} mark={l.mark} sev={l.sev} past={l.past} /><span><b>{l.name}</b> <span className="text-muted">{l.line}</span></span></div>)}
            <p className="text-muted">Click a day, or a request on the list, to decide it on the right.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sheet() {
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const filter = useTimeOffUi((s) => s.filter).trim().toLowerCase();
  const range = useTimeOffUi((s) => s.range);
  const vs = useViewState();
  const dates = useWindowDates();
  const state = vs?.state;

  const rows = useMemo<RowDef[]>(() => {
    if (!state) return [];
    const people = activePharmacists(state, win).filter((p) => !filter || p.name.toLowerCase().includes(filter));
    const byP = indexRecords(state);
    const models = buildSheetRows(state, people, dates, asOf, byP, indexByPharmacist(state), range);
    return people.map((p, i) => {
      const mine = (byP.get(p.id) ?? []).filter((u) => u.last >= win.from && u.first <= win.to);
      const off = mine.filter((u) => kindOf(u) === "approved").length;
      const asked = mine.filter((u) => kindOf(u) === "waiting").length;
      const words = `${off} approved, ${asked} waiting in view`;
      return {
        key: p.id,
        label: `${p.name}, ${words}`,
        tip: `${p.name} | ${words}`,
        head: (
          <span className="w-person">
            <span className="w-disc" aria-hidden="true" style={{ background: paletteVar(p.id) }} />
            <span className="w-pname">{shortName(p.name, 12)}</span>
          </span>
        ),
        cells: models[i]!,
      };
    });
  }, [state, win, dates, asOf, filter, range]);

  // Dragging (or shift-clicking) across a person's days opens the Add form in the right-hand column, filled in with those days.
  const onRange = (pid: string, first: ISODate, last: ISODate) => {
    useApp.getState().select({ pharmacistId: pid, date: first });
    useTimeOffUi.getState().openAdd("add", first, pid, last);
    useTimeOffUi.getState().setRange({ pid, first, last });
  };
  if (!state) return null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      <Controls />
      <div className="w-scroll">
        {rows.length ? <Grid rows={rows} dates={dates} axis="pharmacist" asOf={asOf} corner="People" ariaLabel="Time off by pharmacist" dayButtons={false} onRange={onRange} /> : <p className="p-4 text-sm text-muted">Nobody matches that name.</p>}
      </div>
    </div>
  );
}
