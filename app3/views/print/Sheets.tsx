// The packet as HTML: the same pages as the PDF, drawn from the same PrintModel. Sizes are in inches and points so the
// on-screen sheet matches the paper. Used for the preview and, mounted off-screen, for Ctrl+P.
import type { CSSProperties, ReactNode } from "react";
import { WEEKDAYS, itemLayout, legendText } from "../../print/model.ts";
import type { GlancePage, PrintDay, PrintOptions, Sheet, StorePage } from "../../print/model.ts";

const INK = "#1c1c1c";
const MUTED = "#5c5854";
const NIGHT = "#201820";
const SHUT = "#ddd7cb";
const LINE = "#c8c1b4";
const BRICK = "#8c3a2f";
const HATCH = "repeating-linear-gradient(135deg, transparent 0 0.07in, rgba(120,110,95,0.38) 0.07in 0.078in)";

export const PAPER_IN = { letter: { w: 8.5, h: 11 }, tabloid: { w: 11, h: 17 } } as const;

function margins(o: PrintOptions) {
  const base = o.paper === "tabloid" ? 0.55 : 0.48;
  return { left: o.punch ? base + 0.4 : base, right: base, bottom: base };
}
const scale = (o: PrintOptions) => (o.typeSize === "large" ? 1.2 : 1);

export function OpenBox({ size }: { size: number }) {
  return (
    <span role="img" aria-label="open, needs a pharmacist" data-open-box style={{ display: "inline-block", width: `${size}in`, height: `${size}in`, border: `${Math.max(0.012, size * 0.09)}in solid ${BRICK}`, background: "#fff", boxSizing: "border-box" }} />
  );
}

type Item = { box: true } | { box: false; label: string };
const itemsOf = (d: PrintDay): Item[] => [...d.initials.map((label): Item => ({ box: false, label })), ...Array.from({ length: d.open }, (): Item => ({ box: true }))];

/** Initials and open boxes in a cell of `hIn` inches, laid out exactly as the PDF does. */
function Items({ items, hIn, maxFont, minLine }: { items: Item[]; hIn: number; maxFont: number; minLine: number }) {
  if (!items.length) return null;
  const lay = itemLayout(items.length, hIn, maxFont, minLine);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${lay.perLine}, 1fr)`, gridAutoRows: `${lay.lineH}in`, alignItems: "center", justifyItems: "center", alignContent: "center", height: `${hIn}in` }}>
      {items.map((it, i) =>
        it.box ? <OpenBox key={i} size={Math.min(lay.lineH * 0.78, 0.26)} /> : (
          <span key={i} style={{ fontSize: `${lay.font}pt`, fontWeight: 700, lineHeight: 1, color: INK, whiteSpace: "nowrap" }}>{it.label}</span>
        ),
      )}
    </div>
  );
}

function Header({ kicker, title, meta, right }: { kicker: string; title: string; meta: string; right: string }) {
  return (
    <header style={{ height: "0.92in", position: "relative", flex: "none" }}>
      <div aria-hidden style={{ position: "absolute", left: "-100in", right: "-100in", top: 0, height: "0.09in", background: NIGHT }} />
      <div aria-hidden style={{ position: "absolute", left: "calc(-1 * var(--sheet-left, 0in))", top: 0, width: "1.3in", height: "0.09in", background: "#c8102e" }} />
      <p style={{ position: "absolute", top: "0.13in", margin: 0, fontSize: "11pt", fontWeight: 700, color: NIGHT, lineHeight: 1.2 }}>{kicker}</p>
      <h2 style={{ position: "absolute", top: "0.33in", margin: 0, fontSize: "16pt", fontWeight: 700, color: INK, lineHeight: 1.2, maxWidth: "70%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h2>
      <p style={{ position: "absolute", top: "0.6in", margin: 0, fontSize: "8.5pt", color: MUTED, lineHeight: 1.2 }}>{meta}</p>
      <p style={{ position: "absolute", right: 0, top: "0.33in", margin: 0, fontSize: "11pt", fontWeight: 700, color: NIGHT, lineHeight: 1.2 }}>{right}</p>
    </header>
  );
}

function Key({ open, closed }: { open: boolean; closed: boolean }) {
  return (
    <p style={{ margin: 0, fontSize: "8pt", color: MUTED, display: "flex", gap: "0.18in", alignItems: "center", lineHeight: 1.3 }}>
      {open && <span style={{ display: "inline-flex", gap: "0.05in", alignItems: "center" }}><OpenBox size={0.1} /> = a pharmacist is still needed.</span>}
      {closed && <span style={{ display: "inline-flex", gap: "0.05in", alignItems: "center" }}><span aria-hidden style={{ width: "0.1in", height: "0.1in", background: SHUT, backgroundImage: HATCH, border: `0.006in solid ${LINE}`, boxSizing: "border-box" }} /> = the store is closed.</span>}
    </p>
  );
}

function StoreBlock({ page, o, heightIn }: { page: StorePage; o: PrintOptions; heightIn: number }) {
  const s = scale(o);
  const { w } = PAPER_IN[o.paper];
  const m = margins(o);
  const kicker = `STORE SCHEDULE${page.state ? ` - ${page.state}` : ""}${page.part ? ` - PAGE ${page.part.n} OF ${page.part.of}` : ""}`;
  const legend = page.legend.length ? `Initials: ${page.legend.map(legendText).join("   |   ")}` : "";
  const legendLines = legend ? Math.min(3, Math.ceil(legend.length / ((w - m.left - m.right) * 17))) : 0;
  const gridIn = Math.max(0.8, heightIn - 0.92 - 0.26 - m.bottom - (legendLines + 1) * 0.14 - 0.14);
  const rowIn = gridIn / Math.max(page.weeks.length, 1);
  const anyClosed = page.weeks.some((wk) => wk.some((d) => d.inRange && d.closed));
  return (
    <section data-store-page={page.code} style={{ height: `${heightIn}in`, display: "flex", flexDirection: "column", paddingLeft: `${m.left}in`, paddingRight: `${m.right}in`, paddingBottom: `${m.bottom}in`, boxSizing: "border-box", ["--sheet-left" as string]: `${m.left}in` } as CSSProperties}>
      <Header kicker={kicker} title={page.title} meta={page.revisionLine} right={page.period} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: NIGHT, color: "#fff", height: "0.26in", alignItems: "center", textAlign: "center", fontSize: "8pt", fontWeight: 700, flex: "none" }}>
        {WEEKDAYS.map((d) => <div key={d}>{d.toUpperCase()}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: `${rowIn}in`, flex: "none" }}>
        {page.weeks.flat().map((cell, i) => <Cell key={i} cell={cell} o={o} rowIn={rowIn} s={s} />)}
      </div>
      <div style={{ marginTop: "0.1in" }}>
        {legend && <p style={{ margin: 0, fontSize: "8pt", color: INK, lineHeight: 1.3 }}>{legend}</p>}
        <Key open={page.openTotal > 0} closed={anyClosed} />
      </div>
    </section>
  );
}

function Cell({ cell, rowIn, s }: { cell: PrintDay; o: PrintOptions; rowIn: number; s: number }) {
  const base: CSSProperties = { border: `0.01in solid ${LINE}`, boxSizing: "border-box", position: "relative", overflow: "hidden" };
  if (!cell.inRange) {
    return <div aria-hidden style={{ ...base, background: "#f4f1eb" }}><span style={{ position: "absolute", left: "0.06in", top: "0.04in", fontSize: "9pt", color: MUTED }}>{cell.day}</span></div>;
  }
  const items = itemsOf(cell);
  const label = <span style={{ position: "absolute", left: "0.06in", top: "0.04in", fontSize: `${9 * s}pt`, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{cell.label}</span>;
  const aria = `${cell.date}: ${cell.closed ? "closed" : ""}${cell.initials.length ? ` ${cell.initials.join(", ")}` : ""}${cell.open ? ` ${cell.open} open` : ""}`.trim();
  if (cell.closed) {
    return (
      <div role="group" aria-label={aria} style={{ ...base, background: SHUT, backgroundImage: HATCH }}>
        {label}
        {items.length ? (
          <>
            <span style={{ position: "absolute", right: "0.06in", top: "0.04in", fontSize: "7.5pt", fontWeight: 700, color: MUTED }}>Closed</span>
            <div style={{ position: "absolute", left: 0, right: 0, top: "0.24in" }}><Items items={items} hIn={rowIn - 0.3} maxFont={14 * s} minLine={0.17} /></div>
          </>
        ) : (
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: `${Math.min(13 * s, 15)}pt`, fontWeight: 700, color: MUTED }}>CLOSED</span>
        )}
      </div>
    );
  }
  return (
    <div role="group" aria-label={aria} style={{ ...base, background: "#fff" }}>
      {label}
      <div style={{ position: "absolute", left: 0, right: 0, top: "0.24in" }}><Items items={items} hIn={rowIn - 0.3} maxFont={16 * s} minLine={0.17} /></div>
    </div>
  );
}

function GlanceBlock({ page, o }: { page: GlancePage; o: PrintOptions }) {
  const s = scale(o);
  const { h, w } = PAPER_IN[o.paper];
  const m = margins(o);
  const n = page.dates.length || 1;
  const foot = (page.warningLine ? 1 : 0) + (page.legend.length ? 2 : 0) + 1;
  const avail = h - m.bottom - (foot + 1) * 0.13 - 0.1 - 0.92 - 0.36;
  const rowIn = Math.max(0.2, Math.min(0.46, avail / Math.max(page.rows.length, 1)));
  const innerW = w - m.left - m.right;
  const colIn = (innerW - 0.62) / n;
  const bad = page.warnings.open > 0 || page.warnings.violations > 0;
  const anyOpen = page.rows.some((r) => r.days.some((d) => d.open > 0));
  const anyClosed = page.rows.some((r) => r.days.some((d) => d.closed));
  const cols = `0.62in repeat(${n}, 1fr)`;
  return (
    <section data-glance-page style={{ height: `${h}in`, display: "flex", flexDirection: "column", paddingLeft: `${m.left}in`, paddingRight: `${m.right}in`, paddingBottom: `${m.bottom}in`, boxSizing: "border-box", ["--sheet-left" as string]: `${m.left}in` } as CSSProperties}>
      <Header kicker="ALL STORES AT A GLANCE" title="Pharmacists by store" meta={page.revisionLine + (page.part ? ` - part ${page.part.n} of ${page.part.of}` : "")} right={page.period} />
      <div style={{ display: "grid", gridTemplateColumns: cols, background: NIGHT, color: "#fff", height: "0.36in", alignItems: "center", textAlign: "center", fontWeight: 700, flex: "none" }}>
        <div style={{ textAlign: "left", paddingLeft: "0.06in", fontSize: `${7.5 * s}pt` }}>Store</div>
        {page.dates.map((d) => {
          const parts = d.label.split(" ");
          return (
            <div key={d.date} style={{ lineHeight: 1.1, fontSize: `${Math.min(7.5 * s, colIn * 72 * 0.5)}pt` }}>
              {parts[parts.length - 1]}
              {parts.length > 1 && <div style={{ fontSize: "5pt" }}>{parts[0]!.toUpperCase()}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ flex: "none" }}>
        {page.rows.map((row) => (
          <div key={row.storeId} data-glance-row={row.code} style={{ display: "grid", gridTemplateColumns: cols, height: `${rowIn}in`, border: `0.008in solid ${LINE}`, boxSizing: "border-box" }}>
            <div style={{ fontSize: `${8 * s}pt`, fontWeight: 700, paddingLeft: "0.06in", display: "flex", alignItems: "center", color: INK }}>{row.code}</div>
            {row.days.map((d) => (
              <div key={d.date} style={{ border: `0.004in solid ${LINE}`, boxSizing: "border-box", background: d.closed ? SHUT : "#fff", backgroundImage: d.closed ? HATCH : undefined, overflow: "hidden" }}>
                <Items items={itemsOf(d)} hIn={rowIn - 0.02} maxFont={6.5 * s} minLine={0.1} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto" }}>
        {page.warningLine && <p style={{ margin: 0, fontSize: "7.5pt", color: bad ? BRICK : MUTED, lineHeight: 1.3 }}>{page.warningLine}</p>}
        {page.legend.length > 0 && <p style={{ margin: 0, fontSize: "7.5pt", color: INK, lineHeight: 1.3 }}>Initials: {page.legend.map(legendText).join("   |   ")}</p>}
        <Key open={anyOpen} closed={anyClosed} />
      </div>
    </section>
  );
}

/** One sheet of paper. */
export function SheetView({ sheet, o, index, total, children }: { sheet: Sheet; o: PrintOptions; index: number; total: number; children?: ReactNode }) {
  const { w, h } = PAPER_IN[o.paper];
  return (
    <article
      className="print-sheet"
      aria-label={`Sheet ${index + 1} of ${total}`}
      data-sheet={index + 1}
      style={{ position: "relative", width: `${w}in`, height: `${h}in`, background: "#fff", color: INK, overflow: "hidden", boxSizing: "border-box", filter: o.grayscale ? "grayscale(1)" : undefined, fontFamily: "Helvetica, Arial, sans-serif" }}
    >
      {sheet.kind === "glance" ? <GlanceBlock page={sheet.page} o={o} /> : sheet.pages.length === 1 && !o.twoUp ? <StoreBlock page={sheet.pages[0]} o={o} heightIn={h} /> : (
        <>
          <div style={{ height: `${h / 2}in`, boxSizing: "border-box", borderBottom: `0.015in dashed ${LINE}`, position: "relative" }}>
            <StoreBlock page={sheet.pages[0]} o={o} heightIn={h / 2 - 0.04} />
            <span style={{ position: "absolute", bottom: "0.02in", left: "50%", transform: "translateX(-50%)", fontSize: "7pt", color: MUTED }}>cut</span>
          </div>
          {sheet.pages[1] && <StoreBlock page={sheet.pages[1]} o={o} heightIn={h / 2 - 0.08} />}
        </>
      )}
      <p style={{ position: "absolute", left: 0, right: 0, bottom: "0.16in", margin: 0, textAlign: "center", fontSize: "8pt", color: MUTED }}>{index + 1} / {total}</p>
      {children}
    </article>
  );
}
