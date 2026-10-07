// The pharmacist's home store, as a small code after their name ("Fenn Ritter  MOL"), so the DM can see at a glance where someone usually works.
import { useApp } from "../store.ts";
import { cx } from "./primitives.tsx";

export function HomeCode({ pharmacistId, className }: { pharmacistId: string; className?: string }) {
  const store = useApp((s) => { const b = s.world?.state.pharmacists[pharmacistId]?.baseStoreId; return b ? s.world?.state.stores[b] : undefined; });
  if (!store) return null;
  return (
    <span data-home={store.code} data-tip={`Home store | ${store.name}`} aria-label={`home store ${store.code}`}
      className={cx("ml-1.5 inline-block shrink-0 rounded bg-fill px-1.5 py-px align-middle text-[13px] font-bold leading-5 tracking-wide text-muted", className)}>{store.code}</span>
  );
}
