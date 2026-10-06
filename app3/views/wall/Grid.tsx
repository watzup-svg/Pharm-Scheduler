import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { weekday, type ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { todayISO } from "../../clock.ts";
import { GLYPH, cx } from "../../ui/primitives.tsx";
import { StateMark } from "../../ui/icons.tsx";
import { DOW_LETTER, MONTH_LONG, dayNum, monthIndex, niceDate, type CellModel, type Chip } from "./model.ts";

export type RowDef = { key: string; head: ReactNode; label: string; tip: string; cells: CellModel[] };

export type DayCover = { need: number; got: number };

function ChipView({ ch, axis, drag }: { ch: Chip; axis: CellModel["axis"]; drag: boolean }) {
  const sign = ch.kind === "add" ? "+" : ch.kind === "rem" ? "−" : "";
  return (
    <span
      className={cx("w-chip", ch.kind === "add" && "w-add", ch.kind === "rem" && "w-rem", ch.unconfirmed && "w-unc", ch.struck && ch.kind === "in" && "w-struck", drag && ch.kind === "in" && "w-drag", axis === "pharmacist" && "w-code")}
      draggable={drag && ch.kind === "in" ? true : undefined}
      data-aid={ch.assignmentId}
    >
      {sign}{ch.text}
      {ch.half && <sup className="w-sup" aria-hidden="true">{"½"}</sup>}
    </span>
  );
}

const Cell = memo(function Cell({ m, selected, tab }: { m: CellModel; selected: boolean; tab: boolean }) {
  const closedStore = m.axis === "store" && m.closed && m.chips.length === 0;
  return (
    <div
      role="gridcell"
      tabIndex={tab ? 0 : -1}
      aria-selected={selected}
      aria-label={m.label}
      data-r={m.r}
      data-c={m.c}
      data-date={m.date}
      data-store={m.storeId}
      data-pid={m.pharmacistId}
      data-kind={closedStore ? "closed" : m.hatchedAway ? "away" : undefined}
      data-shape={m.shape ?? undefined}
      data-tip={m.tip}
      data-tip-tone={m.tone === "plain" ? undefined : m.tone}
      data-tip-mark={m.chip ?? undefined}
      className={cx("w-cell", m.past && "w-past", m.weekend && "w-wkend", m.asOfCol && "w-asof", closedStore && "hatch w-closed", m.hatchedAway && "hatch w-away", selected && "w-sel")}
    >
      <span className="w-body">
        {m.chips.map((ch, i) => (
          <span key={ch.key} className="w-item">
            {i > 0 && <span className="w-dot" aria-hidden="true">{"·"}</span>}
            <ChipView ch={ch} axis={m.axis} drag={m.hasDrag} />
          </span>
        ))}
        {m.locum > 0 && <span className="w-tag w-loc">{GLYPH.locum}{m.locum > 1 ? m.locum : ""}</span>}
        {m.axis === "pharmacist" && m.word && <span className={cx("w-word", m.word === "OFF" && "w-off", m.word === "–" && "w-none")}>{m.word}</span>}
        {m.chip && (
          <span className="w-pic">
            <StateMark kind={m.chip} size={16} />
            {m.chipN > 1 && <b className="w-picn" aria-hidden="true">{m.chipN}</b>}
          </span>
        )}
      </span>
    </div>
  );
});

const LAB_STORE = 92;
const LAB_PERSON = 128;
const COL = 49;

function monthBands(dates: ISODate[]): { key: string; from: number; span: number; text: string }[] {
  const out: { key: string; from: number; span: number; text: string }[] = [];
  dates.forEach((d, i) => {
    const mk = d.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.key === mk) last.span += 1;
    else out.push({ key: mk, from: i, span: 1, text: `${MONTH_LONG[monthIndex(d)]} ${d.slice(0, 4)}` });
  });
  return out;
}

export function Grid({ rows, dates, axis, asOf, corner, ariaLabel, cover }: { rows: RowDef[]; dates: ISODate[]; axis: "store" | "pharmacist"; asOf: ISODate; corner: string; ariaLabel: string; cover: Map<ISODate, DayCover> }) {
  const LAB = axis === "store" ? LAB_STORE : LAB_PERSON;
  const selection = useApp((s) => s.selection);
  const ref = useRef<HTMLDivElement>(null);
  const nRows = rows.length;
  const nCols = dates.length;
  const today = todayISO();

  // The selected position, if the selection is on the wall.
  const selPos = useMemo(() => {
    if (!selection) return null;
    const c = dates.indexOf(selection.date);
    if (c < 0) return null;
    const r = axis === "store" ? (selection.storeId ? rows.findIndex((x) => x.cells[0]?.storeId === selection.storeId) : -1) : (selection.pharmacistId ? rows.findIndex((x) => x.cells[0]?.pharmacistId === selection.pharmacistId) : -1);
    return r < 0 ? null : { r, c };
  }, [selection, dates, rows, axis]);

  const [active, setActive] = useState<{ r: number; c: number }>(() => selPos ?? { r: 0, c: Math.max(0, dates.indexOf(asOf)) });
  const focusWanted = useRef(false);
  const cur = { r: Math.min(active.r, Math.max(0, nRows - 1)), c: Math.min(active.c, Math.max(0, nCols - 1)) };

  // Selection changed elsewhere (Inspector, queue): follow it, and keep it in view.
  useEffect(() => {
    if (!selPos) return;
    setActive(selPos);
    const el = ref.current?.querySelector<HTMLElement>(`[data-r="${selPos.r}"][data-c="${selPos.c}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selPos]);

  useLayoutEffect(() => {
    if (!focusWanted.current) return;
    focusWanted.current = false;
    const el = ref.current?.querySelector<HTMLElement>(`[data-r="${cur.r}"][data-c="${cur.c}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  const cellOf = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? t.closest<HTMLElement>('[role="gridcell"]') : null);
  const selectCell = useCallback((el: HTMLElement) => {
    const date = el.dataset.date as ISODate | undefined;
    if (!date) return;
    const st = useApp.getState();
    if (el.dataset.store) st.select({ storeId: el.dataset.store, date });
    else if (el.dataset.pid) st.select({ pharmacistId: el.dataset.pid, date });
  }, []);

  const onClick = (e: MouseEvent) => {
    const el = cellOf(e.target);
    if (!el) return;
    setActive({ r: Number(el.dataset.r), c: Number(el.dataset.c) });
    selectCell(el);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const el = cellOf(e.target);
    if (!el) return;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    let nr = r;
    let nc = c;
    switch (e.key) {
      case "ArrowUp": nr = Math.max(0, r - 1); break;
      case "ArrowDown": nr = Math.min(nRows - 1, r + 1); break;
      case "ArrowLeft": nc = Math.max(0, c - 1); break;
      case "ArrowRight": nc = Math.min(nCols - 1, c + 1); break;
      case "Home": if (e.ctrlKey) nr = 0; nc = 0; break;
      case "End": if (e.ctrlKey) nr = nRows - 1; nc = nCols - 1; break;
      case "PageUp": case "PageDown":
        e.preventDefault();
        useApp.getState().shiftWindow(e.key === "PageUp" ? -7 : 7);
        focusWanted.current = true;
        setActive({ r, c });
        return;
      case "Enter": case " ":
        e.preventDefault();
        selectCell(el);
        return;
      default: return;
    }
    e.preventDefault();
    focusWanted.current = true;
    setActive({ r: nr, c: nc });
  };

  // Direct manipulation: drag an initials chip to another store on the same day. One commit; the domain decides.
  const dragRef = useRef<{ aid: string; date: string; store: string } | null>(null);
  const overRef = useRef<HTMLElement | null>(null);
  const clearOver = () => { overRef.current?.removeAttribute("data-over"); overRef.current = null; };
  const onDragStart = (e: DragEvent) => {
    const chip = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-aid]") : null;
    const el = cellOf(e.target);
    if (!chip || !el || !el.dataset.store || !chip.getAttribute("draggable")) { e.preventDefault(); return; }
    dragRef.current = { aid: chip.dataset.aid!, date: el.dataset.date!, store: el.dataset.store };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chip.textContent ?? "");
  };
  const droppable = (el: HTMLElement | null) => !!(el && dragRef.current && el.dataset.store && el.dataset.date === dragRef.current.date && el.dataset.store !== dragRef.current.store);
  const onDragOver = (e: DragEvent) => {
    const el = cellOf(e.target);
    if (!droppable(el)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overRef.current !== el) { clearOver(); el!.setAttribute("data-over", ""); overRef.current = el; }
  };
  const onDrop = (e: DragEvent) => {
    const el = cellOf(e.target);
    const d = dragRef.current;
    dragRef.current = null;
    clearOver();
    if (!d || !droppable2(el, d)) return;
    e.preventDefault();
    useApp.getState().commit([{ t: "move", assignmentId: d.aid, toStoreId: el!.dataset.store! }]);
    selectCell(el!);
  };
  const onDragEnd = () => { dragRef.current = null; clearOver(); };

  const tpl = `${LAB}px repeat(${nCols}, minmax(${COL}px, 1fr))`;
  const bands = useMemo(() => monthBands(dates), [dates]);

  return (
    <div
      ref={ref}
      role="grid"
      aria-label={ariaLabel}
      aria-rowcount={nRows + 1}
      aria-colcount={nCols + 1}
      className="w-grid"
      style={{ minWidth: LAB + nCols * COL, ["--w-lab" as string]: `${LAB}px` }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="w-head" role="presentation">
        <div className="w-hrow w-months" role="row" style={{ gridTemplateColumns: tpl }}>
          <div className="w-corner" role="columnheader" aria-label={corner}>{corner}</div>
          {bands.map((b) => (
            <div key={b.key} className="w-month" role="columnheader" style={{ gridColumn: `${b.from + 2} / span ${b.span}` }}>
              <span className="w-month-t">{b.text}</span>
            </div>
          ))}
        </div>
        <div className="w-hrow w-days" role="row" style={{ gridTemplateColumns: tpl }}>
          <div className="w-corner" role="presentation" />
          {dates.map((d) => {
            const wd = weekday(d);
            const isAsOf = d === asOf;
            return (
              <div
                key={d}
                role="columnheader"
                aria-label={`${niceDate(d)}${isAsOf ? (asOf === today ? ", today" : ", as of date") : d < asOf ? ", past" : ""}`}
                className={cx("w-day", (wd === 0 || wd === 6) && "w-wkend", d < asOf && "w-past", isAsOf && "w-asof w-asof-head", dayNum(d) === 1 && "w-first")}
              >
                {isAsOf ? <span className="w-today">{asOf === today ? "Today" : "As of"}</span> : <span className="w-dow">{DOW_LETTER[wd]}</span>}
                <span className="w-num">{dayNum(d)}</span>
              </div>
            );
          })}
        </div>
        <div className="w-hrow w-cover" role="row" style={{ gridTemplateColumns: tpl }}>
          <div className="w-corner w-cover-l" role="rowheader">Covered</div>
          {dates.map((d) => {
            const v = cover.get(d) ?? { need: 0, got: 0 };
            const note = v.need === 0 ? `${niceDate(d)} | Nothing needed` : `${niceDate(d)} | ${v.got} of ${v.need} covered`;
            return (
              <div key={d} role="cell" className="w-bar" aria-label={note.replace(" | ", ": ")} data-tip={note} data-tip-tone={v.need > 0 && v.got < v.need ? "bad" : undefined} data-need={v.need} data-got={v.got}>
                <span className="w-bar-t" aria-hidden="true">
                  {v.need > 0 && <span className="w-bar-got" style={{ width: `${(100 * v.got) / v.need}%` }} data-full={v.got >= v.need ? "" : undefined} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {rows.map((row, r) => (
        <div key={row.key} role="row" aria-rowindex={r + 2} className="w-row" style={{ gridTemplateColumns: tpl }}>
          <div role="rowheader" className="w-label" aria-label={row.label} data-tip={row.tip}>{row.head}</div>
          {row.cells.map((m, c) => {
            const selected = !!selPos && selPos.r === r && selPos.c === c;
            return <Cell key={dates[c]} m={m} selected={selected} tab={cur.r === r && cur.c === c} />;
          })}
        </div>
      ))}
    </div>
  );
}

function droppable2(el: HTMLElement | null, d: { date: string; store: string }) {
  return !!(el && el.dataset.store && el.dataset.date === d.date && el.dataset.store !== d.store);
}
