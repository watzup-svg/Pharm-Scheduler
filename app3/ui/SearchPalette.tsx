// Press / or Ctrl+K: jump to a store, a person, a screen or an action. (From the old scheduler's search.)
import { useEffect, useMemo, useRef, useState } from "react";
import { cmp } from "@domain";
import { useApp } from "../store.ts";
import { goTo, isTyping } from "../views/chrome/shared.tsx";
import { fmtDate } from "../copy.ts";
import { evaluateCached } from "../derive.ts";

type Item = { id: string; label: string; hint: string; run: () => void };

export function SearchPalette() {
  const world = useApp((s) => s.world);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !isTyping(e.target) && !e.ctrlKey && !e.metaKey)) { e.preventDefault(); setOpen(true); setQ(""); setAt(0); }
    };
    const ev = () => { setOpen(true); setQ(""); setAt(0); };
    window.addEventListener("keydown", key);
    window.addEventListener("hs-search", ev);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("hs-search", ev); };
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);
  const items = useMemo<Item[]>(() => {
    if (!world) return [];
    const s = useApp.getState();
    const out: Item[] = [];
    const asOf = s.asOf;
    for (const id of Object.keys(world.state.stores).sort(cmp)) { const st = world.state.stores[id]!; out.push({ id: `s${id}`, label: `${st.code} ${st.name}`, hint: "Store", run: () => { s.setAxis("store"); goTo(id, s.selection?.date ?? asOf); } }); }
    for (const id of Object.keys(world.state.pharmacists).sort(cmp)) { const p = world.state.pharmacists[id]!; out.push({ id: `p${id}`, label: p.name, hint: "Pharmacist", run: () => { s.setAxis("pharmacist"); s.setView("wall"); s.select({ pharmacistId: id, date: asOf }); } }); }
    for (const [v, l] of [["overview", "Overview"], ["wall", "Schedule"], ["ahead", "Plan ahead"], ["plan", "Plan (next weeks)"], ["timeoff", "Time off"], ["print", "Print"], ["setup", "Setup"], ["travel", "Travel and mileage"], ["rules", "Rules"], ["checks", "Setup check"]] as const) out.push({ id: `v${v}`, label: l, hint: "Go to", run: () => s.setView(v) });
    // "Cover CLA Tue Oct 20": opens that open day, where the best people and the wider search are already waiting.
    if (open) {
      const ev = evaluateCached(world.state, asOf, { range: s.window });
      const gaps = Object.values(ev.cells).filter((c) => c.date >= asOf && c.open > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : cmp(a.storeId, b.storeId))).slice(0, 40);
      for (const g of gaps) out.push({ id: `c${g.storeId}|${g.date}`, label: `Cover ${world.state.stores[g.storeId]?.code ?? g.storeId} ${fmtDate(g.date)}`, hint: "Action", run: () => goTo(g.storeId, g.date) });
    }
    out.push({ id: "a-out", label: "Someone's out", hint: "Action", run: () => { s.setView("wall"); s.setOutForm(true); } });
    out.push({ id: "a-fix", label: "Show the queue", hint: "Action", run: () => s.setDrawer(true, "queue") });
    out.push({ id: "a-hist", label: "History", hint: "Action", run: () => s.setDrawer(true, "history") });
    return out;
  }, [world, open]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = t ? items.filter((i) => i.label.toLowerCase().includes(t)) : items.filter((i) => i.hint !== "Store" && i.hint !== "Pharmacist");
    return f.slice(0, 12);
  }, [items, q]);
  if (!open || !world) return null;
  const go = (i: Item | undefined) => { if (i) { setOpen(false); i.run(); } };
  return (
    <div role="dialog" aria-label="Search" className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-[480px] overflow-hidden rounded-xl bg-cream shadow-2xl ring-1 ring-black/10" onClick={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }} aria-label="Search stores, people, screens"
          placeholder={`Store, person or screen · today is ${fmtDate(useApp.getState().asOf)}`}
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); else if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, shown.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); } else if (e.key === "Enter") go(shown[at]); }}
          className="h-12 w-full border-b border-line bg-white px-4 text-base outline-none" />
        <ul role="listbox" aria-label="Results" className="max-h-[320px] overflow-y-auto p-1">
          {shown.map((i, n) => (
            <li key={i.id} role="option" aria-selected={n === at} onMouseEnter={() => setAt(n)} onClick={() => go(i)} className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm ${n === at ? "bg-fill" : ""}`}>
              <span>{i.label}</span><span className="text-xs text-muted">{i.hint}</span>
            </li>
          ))}
          {!shown.length && <li className="px-3 py-3 text-sm text-muted">Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}
