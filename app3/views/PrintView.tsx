// Post and print. Posting freezes a snapshot (revision N). Everything printed comes from a snapshot, never from the live schedule,
// so a reprint is the same sheet. Posting never blocks: open shifts and problems are listed first, then print as they were posted.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, cmp, isValidDate, RULE_BY_ID, weekday, type ISODate, type PostingSnapshot, type World } from "@domain";
import { evaluateCached } from "../derive.ts";
import { useApp } from "../store.ts";
import { Btn, Chip, cx, GLYPH } from "../ui/primitives.tsx";
import { DEFAULT_PRINT_OPTIONS, paginate, pdfFileName, periodLabel, snapshotToPrintModel, type PrintModel, type PrintOptions } from "../print/model.ts";
import { buildPacketBytes, packetBlob } from "../print/pdf.ts";
import { PAPER_IN, SheetView } from "./print/Sheets.tsx";
import { PageFrame } from "../ui/PageFrame.tsx";
import { Title } from "./chrome/Title.tsx";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d: ISODate) => `${DAYS[weekday(d)]} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Range = { from: ISODate; to: ISODate };
type PreWarnings = { open: string[]; problems: string[]; overrides: number };

/** What posting this range would put on the snapshot, in words. Mirrors how the domain counts them. */
function preWarnings(world: World, asOf: ISODate, range: Range): PreWarnings {
  const st = world.state;
  const ev = evaluateCached(st, asOf, { range });
  const code = (id: string) => st.stores[id]?.code ?? id;
  const open: string[] = [];
  for (const c of Object.values(ev.cells).sort((a, b) => cmp(a.date, b.date) || cmp(code(a.storeId), code(b.storeId)))) {
    if (c.open > 0) open.push(`${dayLabel(c.date)}: ${code(c.storeId)} needs ${c.open} more`);
  }
  const problems: string[] = [];
  const as = Object.values(st.assignments).filter((a) => a.date >= range.from && a.date <= range.to).sort((a, b) => cmp(a.date, b.date) || cmp(code(a.storeId), code(b.storeId)) || cmp(a.id, b.id));
  for (const a of as) {
    const e = ev.assignments[a.id];
    if (!e || e.counts) continue;
    const why = e.results.find((r) => r.verdict === "Fail" && !r.overridden && RULE_BY_ID[r.ruleId]?.kind === "presence")?.detail ?? "does not count";
    problems.push(`${dayLabel(a.date)}: ${st.pharmacists[a.pharmacistId]?.name ?? a.pharmacistId} at ${code(a.storeId)} - ${why}`);
  }
  let overrides = 0;
  for (const o of Object.values(st.overrides)) {
    const a = st.assignments[o.assignmentId];
    if (a && a.date >= range.from && a.date <= range.to) overrides++;
  }
  return { open, problems, overrides };
}

function confirmLine(w: PreWarnings): string {
  const bits: string[] = [];
  if (w.open.length) bits.push(plural(w.open.length, "open shift", "open shifts"));
  if (w.problems.length) bits.push(plural(w.problems.length, "problem", "problems"));
  if (w.overrides) bits.push(plural(w.overrides, "accepted exception", "accepted exceptions"));
  const list = bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}` : bits[0] ?? "";
  const tail: string[] = [];
  if (w.open.length) tail.push(w.open.length === 1 ? "The open shift will print as an empty box." : "Open shifts will print as empty boxes.");
  if (w.problems.length) tail.push(w.problems.length === 1 ? "The problem prints as placed." : "Problems print as placed.");
  return `Posting with ${list}. ${tail.join(" ")}`.trim();
}

// ---------- test hook (for the browser checks; harmless in real use) ----------
type PdfInfo = { name: string; size: number; head: string };
const hook: { lastPdf: PdfInfo | null; modelFor(rev: number): PrintModel | null; pdfHash(rev: number, o?: Partial<PrintOptions>): string | null } = {
  lastPdf: null,
  modelFor: (rev) => {
    const w = useApp.getState().world;
    const s = w?.journal.snapshots.find((x) => x.revision === rev);
    return w && s ? snapshotToPrintModel(s, w.state) : null;
  },
  pdfHash: (rev, o) => {
    const w = useApp.getState().world;
    const s = w?.journal.snapshots.find((x) => x.revision === rev);
    if (!w || !s) return null;
    const bytes = new Uint8Array(buildPacketBytes(snapshotToPrintModel(s, w.state), { ...DEFAULT_PRINT_OPTIONS, ...o }));
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 16777619); }
    return `${bytes.length}:${(h >>> 0).toString(16)}`;
  },
};
(window as unknown as { __v3print: typeof hook }).__v3print = hook;

function downloadPacket(model: PrintModel, o: PrintOptions) {
  const blob = packetBlob(model, o);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = model.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  void blob.slice(0, 8).arrayBuffer().then((b) => { hook.lastPdf = { name: model.filename, size: blob.size, head: String.fromCharCode(...new Uint8Array(b)) }; });
}

// ---------- the view ----------

export function PrintView() {
  const world = useApp((s) => s.world);
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const readOnly = useApp((s) => s.readOnlyProblems);
  const [edited, setEdited] = useState<Range | null>(null);
  const [selectedRev, setSelectedRev] = useState<number | null>(null);
  const [opts, setOpts] = useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
  const [sheetNo, setSheetNo] = useState(0);

  const range: Range = edited ?? win;
  const rangeOk = isValidDate(range.from) && isValidDate(range.to) && range.from <= range.to;
  const snapshots = world?.journal.snapshots ?? [];
  const newestFirst = useMemo(() => snapshots.slice().sort((a, b) => b.revision - a.revision), [snapshots]);
  const latest = newestFirst[0] ?? null;
  const shown: PostingSnapshot | null = newestFirst.find((s) => s.revision === selectedRev) ?? latest;

  const warn = useMemo(() => (world && rangeOk ? preWarnings(world, asOf, range) : null), [world, asOf, range.from, range.to, rangeOk]); // eslint-disable-line react-hooks/exhaustive-deps
  const changes = useMemo(() => (world ? api.changedSincePosting(world) : []), [world]);
  const model = useMemo(() => (world && shown ? snapshotToPrintModel(shown, world.state) : null), [world?.state.stores, world?.state.pharmacists, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const sheets = useMemo(() => (model ? paginate(model, opts) : []), [model, opts]);

  if (!world) return null;

  const post = (r: Range) => {
    useApp.getState().post(r);
    setSelectedRev(null);
    setSheetNo(0);
  };
  const hasWarn = !!warn && (warn.open.length > 0 || warn.problems.length > 0 || warn.overrides > 0);
  const nextRev = (latest?.revision ?? 0) + 1;
  const setRange = (patch: Partial<Range>) => setEdited({ ...range, ...patch });
  const code = (id: string) => world.state.stores[id]?.code ?? id;
  const storesOf = (v: string) => (v === "off" ? "off" : v.split(",").map(code).join(" + "));
  const printNow = (s: PostingSnapshot) => {
    setSelectedRev(s.revision);
    window.setTimeout(() => window.print(), 80);
  };
  const downloadRev = (s: PostingSnapshot) => downloadPacket(snapshotToPrintModel(s, world.state), opts);
  const page = Math.min(sheetNo, Math.max(0, sheets.length - 1));

  return (
    <PageFrame width="narrow" data-print-view="">
      <style>{printCss(opts)}</style>
      <Title tip="Posting saves a copy of the schedule as it is now. | The printed packet always comes from that copy, so a reprint is the same sheet. | Posting never blocks: open shifts and problems are listed first.">Post and print</Title>

      {/* 1. Post */}
      <section className="surface p-4" aria-labelledby="post-h">
        <h2 id="post-h" className="text-base font-semibold">Post this schedule</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium">From
            <input type="date" value={range.from} onChange={(e) => setRange({ from: e.target.value })} className="h-8 rounded-md border border-edge bg-cream px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">To
            <input type="date" value={range.to} onChange={(e) => setRange({ to: e.target.value })} className="h-8 rounded-md border border-edge bg-cream px-2 text-sm" />
          </label>
          {edited && <Btn tone="ghost" onClick={() => setEdited(null)}>Use the schedule window ({periodLabel(win.from, win.to)})</Btn>}
        </div>
        {!rangeOk ? (
          <p className="mt-3 text-sm text-illegal" role="status">{GLYPH.serious} Pick a start date that is on or before the end date.</p>
        ) : (
          <div className="mt-3" data-prewarn>
            {hasWarn ? (
              <p className="text-sm font-medium" role="status" data-confirm-line><span aria-hidden className="mr-1 text-warn">{GLYPH.warning}</span>{confirmLine(warn!)}</p>
            ) : (
              <p className="text-sm text-ok" role="status" data-confirm-line>{GLYPH.ok} Nothing open and no problems in {periodLabel(range.from, range.to)}.</p>
            )}
            {hasWarn && (
              <div className="mt-2 flex flex-col gap-1">
                <Details title={`Open shifts (${warn!.open.length})`} items={warn!.open} />
                <Details title={`Problems (${warn!.problems.length})`} items={warn!.problems} />
                {warn!.overrides > 0 && <p className="text-xs text-muted">{plural(warn!.overrides, "accepted exception is", "accepted exceptions are")} on file for these dates and will be counted on the posting.</p>}
              </div>
            )}
          </div>
        )}
        {readOnly && <p className="mt-2 text-xs text-illegal">{GLYPH.serious} This file opened read-only, so it cannot be posted.</p>}
        <div className="mt-3">
          <Btn tone="ink" disabled={!rangeOk || !!readOnly} onClick={() => post(range)} data-post>
            {hasWarn ? "Post anyway" : "Post this schedule"} as revision {nextRev}
          </Btn>
        </div>
      </section>

      {/* 2. Posted schedules */}
      <section className="surface p-4" aria-labelledby="list-h">
        <h2 id="list-h" className="text-base font-semibold">Posted schedules</h2>
        {newestFirst.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing has been posted yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line" data-snapshots>
            {newestFirst.map((s) => (
              <li key={s.revision} data-revision={s.revision} aria-current={s.revision === shown?.revision ? "true" : undefined} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2", s.revision === shown?.revision && "bg-fill/60 -mx-2 px-2 rounded-md")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Revision {s.revision}{s.revision === latest?.revision ? <span className="ml-2 text-xs font-normal text-muted">latest</span> : null}</p>
                  <p className="text-xs text-muted">{periodLabel(s.from, s.to)} - posted {dayLabel(s.postedOn)}, {s.postedOn.slice(0, 4)}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    <Chip tone={s.warnings.open ? "serious" : "ok"}>{s.warnings.open ? `${GLYPH.open} ${plural(s.warnings.open, "open shift", "open shifts")}` : `${GLYPH.ok} no open shifts`}</Chip>
                    <Chip tone={s.warnings.violations ? "serious" : "ok"}>{s.warnings.violations ? `${GLYPH.serious} ${plural(s.warnings.violations, "problem", "problems")}` : `${GLYPH.ok} no problems`}</Chip>
                    {s.warnings.overrides > 0 && <Chip tone="info">{plural(s.warnings.overrides, "accepted exception", "accepted exceptions")}</Chip>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Btn onClick={() => { setSelectedRev(s.revision); setSheetNo(0); }} aria-label={`Preview revision ${s.revision}`}>Preview</Btn>
                  <Btn onClick={() => printNow(s)} aria-label={`Print revision ${s.revision}`}>Print</Btn>
                  <Btn onClick={() => downloadRev(s)} aria-label={`Download PDF of revision ${s.revision}`} title={pdfFileName(s)}>Download PDF</Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Changed since posting */}
      {latest && (
        <section className="surface p-4" aria-labelledby="chg-h" data-changes>
          <h2 id="chg-h" className="text-base font-semibold">Changed since posting</h2>
          {changes.length === 0 ? (
            <p className="mt-2 text-sm text-ok">{GLYPH.ok} Nothing has changed since revision {latest.revision}.</p>
          ) : (
            <>
              <p className="mt-2 text-sm font-medium">{plural(changes.length, "day differs", "days differ")} from revision {latest.revision}. Tell these people.</p>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-sm" data-change-list>
                {changes.map((c) => {
                  const p = world.state.pharmacists[c.pharmacistId];
                  return (
                    <li key={`${c.pharmacistId}|${c.date}`}>
                      <span className="font-medium">{dayLabel(c.date)}:</span> {p?.name ?? c.pharmacistId}{p ? ` (${p.initials})` : ""} was {storesOf(c.posted)}, now {storesOf(c.now)}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="mt-3">
            <Btn tone={changes.length ? "ink" : "quiet"} disabled={!!readOnly} onClick={() => post({ from: latest.from, to: latest.to })} data-post-new>
              Post revision {nextRev} for the same dates
            </Btn>
          </div>
        </section>
      )}

      {/* 4. Print options and preview */}
      <section className="surface p-4" aria-labelledby="opt-h">
        <h2 id="opt-h" className="text-base font-semibold">Print packet</h2>
        {!model || !shown ? (
          <p className="mt-1 text-sm text-muted">Post a schedule to preview and print it.</p>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-muted">Revision {shown.revision}, {periodLabel(shown.from, shown.to)}. {plural(model.stores.length, "store", "stores")}, {plural(sheets.length, "sheet", "sheets")}.</p>
            <fieldset className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2.5" aria-label="Print options" data-options>
              <label className="flex flex-col gap-1 text-xs font-medium">Paper
                <select value={opts.paper} onChange={(e) => { setOpts({ ...opts, paper: e.target.value as PrintOptions["paper"] }); }} className="h-8 rounded-md border border-edge bg-cream px-2 text-sm">
                  <option value="letter">Letter (8.5 x 11)</option>
                  <option value="tabloid">Tabloid (11 x 17)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium">Type size
                <select value={opts.typeSize} onChange={(e) => setOpts({ ...opts, typeSize: e.target.value as PrintOptions["typeSize"] })} className="h-8 rounded-md border border-edge bg-cream px-2 text-sm">
                  <option value="large">Large</option>
                  <option value="normal">Normal</option>
                </select>
              </label>
              <Check label="Grayscale" checked={opts.grayscale} onChange={(v) => setOpts({ ...opts, grayscale: v })} />
              <Check label="Two stores per sheet" checked={opts.twoUp} onChange={(v) => { setOpts({ ...opts, twoUp: v }); setSheetNo(0); }} />
              <Check label="Punch margin" checked={opts.punch} onChange={(v) => setOpts({ ...opts, punch: v })} />
              <Check label="All stores at a glance" checked={opts.includeGlance} onChange={(v) => { setOpts({ ...opts, includeGlance: v }); setSheetNo(0); }} />
            </fieldset>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Btn tone="ink" onClick={() => downloadRev(shown)} data-download>Download PDF</Btn>
              <span className="text-xs text-muted">{pdfFileName(shown)}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <Btn onClick={() => setSheetNo(Math.max(0, page - 1))} disabled={page <= 0} aria-label="Previous sheet">Back</Btn>
                <span className="text-sm" aria-live="polite" data-sheet-count>Sheet {sheets.length ? page + 1 : 0} of {sheets.length}</span>
                <Btn onClick={() => setSheetNo(Math.min(sheets.length - 1, page + 1))} disabled={page >= sheets.length - 1} aria-label="Next sheet">Next</Btn>
              </span>
            </div>
            <Preview opts={opts}>
              {sheets[page] && <SheetView sheet={sheets[page]} o={opts} index={page} total={sheets.length} />}
            </Preview>
            <p className="mt-2 text-xs text-muted">Ctrl+P prints the whole packet.</p>
          </>
        )}
      </section>

      {/* Printing: every sheet, off screen, shown only by the browser's print. */}
      {model && createPortal(
        <div className="v3-print-root" aria-hidden>
          {sheets.map((sh, i) => <SheetView key={i} sheet={sh} o={opts} index={i} total={sheets.length} />)}
        </div>,
        document.body,
      )}
    </PageFrame>
  );
}

function printCss(o: PrintOptions): string {
  const { w, h } = PAPER_IN[o.paper];
  return `
.v3-print-root { display: none; }
@media print {
  @page { size: ${w}in ${h}in; margin: 0; }
  html, body { background: #fff !important; }
  #root { display: none !important; }
  .v3-print-root { display: block !important; }
  .v3-print-root .print-sheet { break-after: page; page-break-after: always; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex h-8 items-center gap-1.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-ink" />
      {label}
    </label>
  );
}

function Details({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-muted focus-visible:outline-2 focus-visible:outline-ink">{title}</summary>
      <ul className="mt-1 flex max-h-48 flex-col gap-0.5 overflow-y-auto pl-4">
        {items.map((t, i) => <li key={i} className="list-disc">{t}</li>)}
      </ul>
    </details>
  );
}

/** The sheet at a size that fits the column. `zoom` scales layout, so the sheet is the real paper size. */
function Preview({ opts, children }: { opts: PrintOptions; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const paper = PAPER_IN[opts.paper];
  const zoom = Math.min(1, Math.max(0.3, (width - 8) / (paper.w * 96)));
  return (
    <div ref={ref} className="mt-3 overflow-hidden rounded-md bg-fill p-1" role="region" aria-label="Sheet preview" data-preview>
      <div style={{ zoom, width: `${paper.w}in`, boxShadow: "0 0 0 1px var(--color-line), 0 10px 24px -16px rgb(28 25 23 / 0.4)" }}>{children}</div>
    </div>
  );
}
