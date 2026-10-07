import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { weekday, type ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { todayISO } from "../../clock.ts";
import { cx } from "../../ui/primitives.tsx";
import { BlockMark } from "../../ui/icons.tsx";
import { DOW_LETTER, MONTH_LONG, dayNum, monthIndex, niceDate, type CellModel, type Chip } from "./model.ts";
import { drag, useWallUi } from "./ui.ts";

export type RowDef = { key: string; head: ReactNode; label: string; tip: string; cells: CellModel[] };

/** People axis: the store code. Italic with a dashed underline = not confirmed; + and − = what a preview would add or take away. */
function CodeView({ ch }: { ch: Chip }) {
  const sign = ch.kind === "add" ? "+" : ch.kind === "rem" ? "−" : "";
  return (
    <span className={cx("w-chip w-code", ch.kind === "add" && "w-add", ch.kind === "rem" && "w-rem", ch.unconfirmed && "w-unc")}>
      {sign}{ch.text}
      {ch.half && <sup className="w-sup" aria-hidden="true">{"½"}</sup>}
    </span>
  );
}

/** The coloured block. Store axis: no text at all, only the picture of the worst thing still wrong, a count, a "1/2". People axis: the store code. */
function Block({ m }: { m: CellModel }) {
  if (m.block === "none") return null;
  const store = m.axis === "store" || !!m.centered;
  return (
    <span
      data-run={m.run}
      className={cx("w-block", m.block === "closed" && "hatch", m.block === "away" && "hatch", !store && "w-pblock")}
      data-block={m.block}
      data-sev={m.iconTone ?? undefined}
      draggable={store && m.hasDrag ? true : undefined}
      data-aid={store && m.hasDrag ? m.dragAid : undefined}
    >
      {!store && m.chips.map((ch, i) => (
        <span key={ch.key} className="w-item">
          {i > 0 && <span className="w-dot" aria-hidden="true">{"·"}</span>}
          <CodeView ch={ch} />
        </span>
      ))}
      {m.chip && (
        <span className={cx("w-pic", !store && "w-pic-corner")}>
          <BlockMark kind={m.chip} tone={m.iconTone ?? undefined} n={m.chipN} size={store ? 22 : 18} />
        </span>
      )}
      {store && m.frac && <span className="w-frac" aria-hidden="true">{m.frac}</span>}
      {store && (m.ghostAdd > 0 || m.ghostRem > 0) && (
        <span className="w-ghost" aria-hidden="true">{m.ghostAdd > 0 ? `+${m.ghostAdd}` : ""}{m.ghostRem > 0 ? `\u2212${m.ghostRem}` : ""}</span>
      )}
    </span>
  );
}

const Cell = memo(function Cell({ m, selected, tab }: { m: CellModel; selected: boolean; tab: boolean }) {
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
      data-block={m.block}
      data-icon={m.chip ?? undefined}
      data-sev={m.iconTone ?? undefined}
      data-faded={m.faded ? "" : undefined}
      data-picked={m.picked ? "" : undefined}
      data-ghost={m.ghostAdd || m.ghostRem ? "" : undefined}
      data-kind={m.block === "closed" ? "closed" : m.block === "away" ? "away" : undefined}
      data-tip={m.tip}
      data-tip-list=""
      data-tip-tone={m.tone === "plain" ? undefined : m.tone}
      data-tip-mark={m.chip ?? undefined}
      className={cx("w-cell", (m.past || m.faded) && "w-past", m.faded && "w-faded", m.weekend && "w-wkend", m.asOfCol && "w-asof", selected && "w-sel")}
    >
      <Block m={m} />
    </div>
  );
});


/** One row of the wall. Memoized: a selection or tab-stop change re-renders only the rows it touches. */
const RowView = memo(function RowView({ row, r, dates, tpl, selCol, tabCol }: { row: RowDef; r: number; dates: ISODate[]; tpl: string; selCol: number; tabCol: number }) {
  return (
    <div role="row" aria-rowindex={r + 2} data-ri={r} className="w-row" style={{ gridTemplateColumns: tpl }}>
      <div role="rowheader" className="w-label" aria-label={row.label} data-tip={row.tip}>{row.head}</div>
      {row.cells.map((m, c) => <Cell key={dates[c]} m={m} selected={selCol === c} tab={tabCol === c} />)}
    </div>
  );
});

const LAB_STORE = 92;
const LAB_PERSON = 128;
const COL = 49;
/** Past this many rows only the rows near the viewport are drawn (rows are measured, so wrapped rows stay exact). */
const VIRT_MIN_ROWS = 60;
const OVERSCAN_PX = 500;
const EST_ROW = 38;

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

export function Grid({ rows, dates, axis, asOf, corner, ariaLabel, dayButtons = true, onRange, onPick }: { rows: RowDef[]; dates: ISODate[]; axis: "store" | "pharmacist"; asOf: ISODate; corner: string; ariaLabel: string; dayButtons?: boolean; onRange?: (pharmacistId: string, first: ISODate, last: ISODate) => void; /** When given, a click hands the cell back instead of selecting it. */ onPick?: (c: { pharmacistId?: string; storeId?: string; date: ISODate }) => void }) {
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
  const cur = { r: Math.min(active.r, Math.max(0, nRows - 1)), c: Math.min(active.c, Math.max(0, nCols - 1)) };

  // Rows near the viewport only, once there are many rows. Heights are measured after paint and remembered per row.
  const virt = nRows >= VIRT_MIN_ROWS;
  const [view, setView] = useState({ top: 0, height: 900, head: 74, v: 0 });
  const heights = useRef(new Map<string, number>());
  const rowKey = (r: number) => `${axis}|${rows[r]!.key}`;
  const hOf = (r: number) => heights.current.get(rowKey(r)) ?? EST_ROW;
  let first = 0;
  let last = nRows - 1;
  let padTop = 0;
  let padBottom = 0;
  if (virt) {
    const lo = view.top - OVERSCAN_PX - view.head;
    const hi = view.top + view.height + OVERSCAN_PX - view.head;
    let y = 0;
    let f = -1;
    let l = nRows - 1;
    for (let r = 0; r < nRows; r++) {
      const h = hOf(r);
      if (f < 0 && y + h > lo) { f = r; padTop = y; }
      if (y > hi) { l = r - 1; break; }
      y += h;
    }
    first = Math.max(0, f);
    last = Math.max(first, l);
    let after = 0;
    for (let r = last + 1; r < nRows; r++) after += hOf(r);
    padBottom = after;
  }
  const rowTop = (r: number) => { let y = view.head; for (let i = 0; i < r; i++) y += hOf(i); return y; };

  // What still has to be brought on screen after a render: a row that was not drawn yet, a cell to focus.
  const want = useRef<{ focus: boolean; reveal: boolean } | null>(null);
  const scroller = () => ref.current?.closest<HTMLElement>(".w-scroll") ?? null;

  // Selection changed elsewhere (Inspector, queue): follow it, and keep it in view.
  useEffect(() => {
    if (!selPos) return;
    setActive(selPos);
    want.current = { focus: false, reveal: true };
  }, [selPos]);

  useLayoutEffect(() => {
    const sc = scroller();
    const w = want.current;
    if (w) {
      const el = ref.current?.querySelector<HTMLElement>(`[data-r="${cur.r}"][data-c="${cur.c}"]`);
      if (el) {
        want.current = null;
        if (w.focus) el.focus();
        if (w.focus || w.reveal) el.scrollIntoView({ block: "nearest", inline: "nearest" });
        // The browser does not always honour the scroll margin when the scroll area is short; never leave the cell under the sticky header.
        if ((w.focus || w.reveal) && sc) {
          const headH = ref.current?.querySelector<HTMLElement>(".w-head")?.getBoundingClientRect().height ?? 0;
          const under = sc.getBoundingClientRect().top + headH - el.getBoundingClientRect().top;
          if (under > 0) sc.scrollTop -= under + 4;
        }
      } else if (virt && sc) {
        // The row is not drawn: scroll to it; the scroll event redraws the window and this runs again.
        const top = rowTop(cur.r);
        const h = hOf(cur.r);
        if (top < sc.scrollTop + view.head + 8) sc.scrollTop = Math.max(0, top - view.head - 8);
        else if (top + h > sc.scrollTop + sc.clientHeight) sc.scrollTop = top + h - sc.clientHeight + 8;
        setView((v) => ({ ...v, top: sc.scrollTop, height: sc.clientHeight }));
      }
    }
    if (!virt || !ref.current) return;
    // Measure what is drawn; redraw once if an estimate was off.
    let changed = false;
    const head = ref.current.querySelector<HTMLElement>(".w-head")?.getBoundingClientRect().height ?? view.head;
    ref.current.querySelectorAll<HTMLElement>(":scope > .w-row").forEach((el) => {
      const r = Number(el.dataset.ri);
      const row = rows[r];
      if (!row) return;
      const h = el.getBoundingClientRect().height;
      const k = `${axis}|${row.key}`;
      if (Math.abs((heights.current.get(k) ?? EST_ROW) - h) > 0.4) { heights.current.set(k, h); changed = true; }
    });
    if (changed || Math.abs(head - view.head) > 0.4) setView((v) => ({ ...v, head, v: v.v + 1 }));
  });

  // Follow the scroller (the wall's scroll box around the grid): its position and size decide which rows are drawn.
  useLayoutEffect(() => {
    const sc = scroller();
    if (!sc || !virt) return;
    let raf = 0;
    const read = () => { raf = 0; setView((v) => (Math.abs(v.top - sc.scrollTop) < 40 && v.height === sc.clientHeight ? v : { ...v, top: sc.scrollTop, height: sc.clientHeight })); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    sc.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onScroll);
    ro?.observe(sc);
    return () => { sc.removeEventListener("scroll", onScroll); ro?.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [virt]);

  const cellOf = (t: EventTarget | null): HTMLElement | null => (t instanceof Element ? t.closest<HTMLElement>('[role="gridcell"]') : null);
  const selectCell = useCallback((el: HTMLElement) => {
    const date = el.dataset.date as ISODate | undefined;
    if (!date) return;
    if (onPick) { onPick({ date, ...(el.dataset.pid ? { pharmacistId: el.dataset.pid } : {}), ...(el.dataset.store ? { storeId: el.dataset.store } : {}) }); return; }
    const st = useApp.getState();
    if (el.dataset.store) st.select({ storeId: el.dataset.store, date });
    else if (el.dataset.pid) st.select({ pharmacistId: el.dataset.pid, date });
  }, [onPick]);

  // Dragging across one person's days (the Time off sheet): the days light up as the pointer moves, and letting go hands the range back.
  const rangeDrag = useRef<{ pid: string; c0: number; r: number; c1: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const paintRange = (r: number, a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    ref.current?.querySelectorAll<HTMLElement>(".w-picking").forEach((e) => e.classList.remove("w-picking"));
    for (let c = lo; c <= hi; c++) ref.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.classList.add("w-picking");
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!onRange || e.button !== 0) return;
    const el = cellOf(e.target);
    if (!el || !el.dataset.pid) return;
    rangeDrag.current = { pid: el.dataset.pid, c0: Number(el.dataset.c), r: Number(el.dataset.r), c1: Number(el.dataset.c), moved: false };
  };
  const onPointerOver = (e: React.PointerEvent) => {
    const d = rangeDrag.current;
    if (!d) return;
    const el = cellOf(e.target);
    if (!el || Number(el.dataset.r) !== d.r) return;
    const c = Number(el.dataset.c);
    if (c === d.c1 && !d.moved) return;
    d.c1 = c;
    if (c !== d.c0) d.moved = true;
    if (d.moved) paintRange(d.r, d.c0, c);
  };
  useEffect(() => {
    const up = () => {
      const d = rangeDrag.current;
      rangeDrag.current = null;
      ref.current?.querySelectorAll<HTMLElement>(".w-picking").forEach((e) => e.classList.remove("w-picking"));
      if (!d || !d.moved || !onRange) return;
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      const lo = Math.min(d.c0, d.c1), hi = Math.max(d.c0, d.c1);
      if (dates[lo] && dates[hi]) onRange(d.pid, dates[lo]!, dates[hi]!);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [onRange, dates]);

  const onClick = (e: MouseEvent) => {
    if (justDragged.current) return;
    const el = cellOf(e.target);
    if (!el) return;
    // Shift-click extends from the selected day to this one, along the same person's row.
    const sel0 = useApp.getState().selection;
    if (onRange && e.shiftKey && el.dataset.pid && sel0?.pharmacistId === el.dataset.pid && !sel0.storeId && el.dataset.date) {
      const [a, b] = [sel0.date, el.dataset.date as ISODate].sort();
      onRange(el.dataset.pid, a!, b!);
      return;
    }
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
        want.current = { focus: true, reveal: true };
        setActive({ r, c });
        return;
      case "Enter": case " ":
        e.preventDefault();
        selectCell(el);
        return;
      default: return;
    }
    e.preventDefault();
    want.current = { focus: true, reveal: true };
    setActive({ r: nr, c: nc });
  };

  // Direct manipulation: drag an initials chip to another store on the same day. One commit; the domain decides.
  const dragRef = drag;
  const overRef = useRef<HTMLElement | null>(null);
  const clearOver = () => { overRef.current?.removeAttribute("data-over"); overRef.current = null; };
  const onDragStart = (e: DragEvent) => {
    const chip = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-aid]") : null;
    const el = cellOf(e.target);
    if (!chip || !el || !el.dataset.store || !chip.getAttribute("draggable")) { e.preventDefault(); return; }
    dragRef.current = { aid: chip.dataset.aid!, date: el.dataset.date!, store: el.dataset.store };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "move");
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
      // When the tab-stop cell is not drawn (its row is scrolled away), the grid itself takes the tab stop and brings the cell back.
      tabIndex={virt && (cur.r < first || cur.r > last) ? 0 : undefined}
      onFocus={(e) => { if (e.target === e.currentTarget) { want.current = { focus: true, reveal: true }; setActive({ ...cur }); } }}
      style={{ minWidth: LAB + nCols * COL, ["--w-lab" as string]: `${LAB}px` }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
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
                onClick={dayButtons ? () => useWallUi.getState().setDay(d) : undefined}
                className={cx("w-day", (wd === 0 || wd === 6) && "w-wkend", d < asOf && "w-past", isAsOf && "w-asof w-asof-head", dayNum(d) === 1 && "w-first", dayButtons && "w-day-btn")}
              >
                {isAsOf ? <span className="w-today">{asOf === today ? "Today" : "As of"}</span> : <span className="w-dow">{DOW_LETTER[wd]}</span>}
                <span className="w-num">{dayNum(d)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {padTop > 0 && <div role="presentation" style={{ height: padTop }} />}
      {rows.slice(first, last + 1).map((row, i) => {
        const r = first + i;
        return <RowView key={row.key} row={row} r={r} dates={dates} tpl={tpl} selCol={selPos && selPos.r === r ? selPos.c : -1} tabCol={cur.r === r ? cur.c : -1} />;
      })}
      {padBottom > 0 && <div role="presentation" style={{ height: padBottom }} />}
    </div>
  );
}

function droppable2(el: HTMLElement | null, d: { date: string; store: string }) {
  return !!(el && el.dataset.store && el.dataset.date === d.date && el.dataset.store !== d.store);
}
