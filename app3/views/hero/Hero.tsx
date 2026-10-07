// The old scheduler's dark header band, slimmed to about 100px: a big number, count tiles with their mark chips, actions, and one graphic.
// Same template on every view. It can fold to a single line (the choice is remembered in this browser).
import { useState, type ReactNode } from "react";
import { StateMark, type MarkKind } from "../../ui/icons.tsx";
import { cx } from "../../ui/primitives.tsx";

export type Tile = { kind: MarkKind; n: number | string; word: string; onClick?: () => void; tip?: string };

const KEY = "hs-hero-folded";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const write = (v: boolean) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* browser storage may be off */ } };

export function Hero({ label, lead, leadWord, tiles, actions, graphic }: { label: string; lead: number | string; leadWord: string; tiles: Tile[]; actions?: ReactNode; graphic?: ReactNode }) {
  const [folded, setFolded] = useState(read);
  const toggle = () => setFolded((f) => { write(!f); return !f; });
  return (
    <section aria-label={`${label} summary`} className="hero-band relative mx-3 mt-3 overflow-hidden rounded-xl bg-night text-cream shadow-[0_10px_24px_-14px_rgba(32,24,32,0.7)]">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-52 rotate-12 opacity-[0.07]" style={{ background: "repeating-linear-gradient(60deg,#fff 0 1px,transparent 1px 14px)" }} />
      {folded ? (
        <div className="relative flex h-10 items-center gap-4 px-4 text-sm">
          <b className="text-lg leading-none">{lead}</b>
          <span className="text-cream/80">{leadWord}</span>
          <span className="text-cream/50">·</span>
          <span className="text-cream/80">{label}</span>
          <div className="ml-4 flex items-center gap-3">
            {tiles.map((t) => <span key={t.kind + t.word} className="inline-flex items-center gap-1.5"><StateMark kind={t.kind} size={16} /> <b>{t.n}</b> <span className="text-cream/70">{t.word}</span></span>)}
          </div>
          <button type="button" onClick={toggle} aria-expanded={false} className="ml-auto rounded px-2 py-1 text-xs text-cream/80 hover:bg-white/10">Show header</button>
        </div>
      ) : (
        <div className="relative flex min-h-[104px] items-center gap-5 px-4 py-3">
          <div className="min-w-[88px]">
            <div className="text-[44px] font-light leading-none tracking-tight text-[#f3dcd6]" style={{ textShadow: "0 0 18px rgba(243,220,214,0.25)" }}>{lead}</div>
            <div className="mt-1 text-xs text-cream/70">{leadWord}</div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {tiles.map((t) => {
              const inner = (<><StateMark kind={t.kind} size={20} /><span className="text-base font-semibold leading-none">{t.n}</span><span className="text-xs text-cream/70">{t.word}</span></>);
              const cls = "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-white/[0.07] px-2.5 ring-1 ring-inset ring-white/10";
              return t.onClick
                ? <button key={t.kind + t.word} type="button" onClick={t.onClick} data-tip={t.tip} className={cx(cls, "hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white")}>{inner}</button>
                : <span key={t.kind + t.word} className={cls}>{inner}</span>;
            })}
          </div>
          {actions && <div className="ml-1 flex shrink-0 flex-col items-stretch gap-1.5">{actions}</div>}
          <div className="ml-auto flex items-center gap-2">
            {graphic}
            <button type="button" onClick={toggle} aria-expanded aria-label="Fold the header" data-tip="Fold the header | Gives the wall more room" className="self-start rounded px-1.5 py-0.5 text-sm leading-none text-cream/70 hover:bg-white/10">–</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The buttons on the band. Ghost on dark; the "away" one is yellow with the palm, as in the old app. */
export function HeroBtn({ children, onClick, tone = "ghost", disabled, title, "aria-label": ariaLabel }: { children: ReactNode; onClick?: () => void; tone?: "light" | "ghost" | "away"; disabled?: boolean; title?: string; "aria-label"?: string }) {
  const t = tone === "light" ? "bg-white text-ink hover:bg-cream" : tone === "away" ? "bg-warn-bg text-warn ring-1 ring-inset ring-warn/40 hover:brightness-95" : "text-cream ring-1 ring-inset ring-white/25 hover:bg-white/10";
  return <button type="button" onClick={onClick} disabled={disabled} data-tip={title} aria-label={ariaLabel} className={cx("inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white", t)}>{children}</button>;
}
