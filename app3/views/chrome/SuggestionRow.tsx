// The best single person for an open day: a few lines and a Preview that opens the same proposal bar a cover option does.
import { useMemo } from "react";
import type { ISODate, Suggestion } from "@domain";
import { useApp } from "../../store.ts";
import { shortName } from "../../names.ts";
import { greedyBest } from "../../suggestions.ts";
import { Act } from "../inspector/ui.tsx";
import { useLock } from "../inspector/lib.ts";
import { goTo } from "./shared.tsx";

type Item = { id: string; date: ISODate; storeId?: string; storeIds?: string[] };
const storeOf = (i: Item) => i.storeId ?? i.storeIds?.[0] ?? "";

/** Suggestions for a list of open days (any order): date order, each assuming the earlier ones were accepted. Only days up to the last wanted one are worked out. */
export function useGreedy<T extends Item>(items: T[], wanted: (i: T) => boolean): Map<string, Suggestion | null> {
  const state = useApp((s) => s.world?.state);
  const asOf = useApp((s) => s.asOf);
  const key = items.filter(wanted).map((i) => i.id).join(",");
  return useMemo(() => {
    const out = new Map<string, Suggestion | null>();
    if (!state) return out;
    const sorted = items.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const last = sorted.reduce((n, i, k) => (wanted(i) ? k : n), -1);
    if (last < 0) return out;
    const part = sorted.slice(0, last + 1);
    const res = greedyBest(state, asOf, part.map((i) => ({ storeId: storeOf(i), date: i.date })));
    part.forEach((i, k) => out.set(i.id, res[k] ?? null));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, asOf, items, key]);
}

export function SuggestionRow({ storeId, date, sg, indent = 44, quiet = false }: { storeId: string; date: string; indent?: number; quiet?: boolean; sg: Suggestion | null | undefined }) {
  const state = useApp((s) => s.world?.state);
  const lock = useLock();
  if (!state || sg === undefined) return null;
  if (!sg) return <p className="px-2.5 pb-2 text-sm text-muted" style={{ paddingLeft: indent }} data-queue-suggestion="none">Nobody can cover this alone. Open the day for plans with several moves.</p>;
  const c = sg.choice;
  const name = state.pharmacists[c.pharmacistId]?.name ?? c.pharmacistId;
  const longDrive = sg.costs.some((x) => x.kind === "drive");
  const other = sg.costs.filter((x) => x.kind !== "drive");
  return (
    <div className="pb-2 pr-2.5" style={{ paddingLeft: indent }} data-queue-suggestion={sg.clean ? "clean" : "costs"}>
      <div className="flex items-center justify-between gap-2">
        <b className="min-w-0 truncate text-sm">Best: {shortName(name, 22)}</b>
        <Act tone={quiet ? "quiet" : "ink"} disabled={!!lock} title={lock ?? undefined} aria-label={`Preview ${name} at ${state.stores[storeId]?.code ?? storeId}`} onClick={() => { goTo(storeId, date); useApp.getState().previewEdits(sg.edits, [sg.sentence]); }} className="shrink-0">Preview</Act>
      </div>
      <p className="text-sm text-ink/80">
        {sg.detail.replace(/\.$/, "")}
        {c.travelMinutes ? <span className={longDrive ? "font-semibold text-[#6b5400]" : ""}> · {c.travelMinutes} min drive</span> : null}
      </p>
      {other.length > 0 && <p className="text-sm text-muted">Costs: {other.map((x) => x.text).join(" · ")}</p>}
    </div>
  );
}

