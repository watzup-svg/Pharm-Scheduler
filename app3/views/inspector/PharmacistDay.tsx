// Inspector for one pharmacist on one day: where they are, time-off records, and where they could go.
import { useMemo, useState } from "react";
import { prepareChoices, requiredFor, indexRequirements, type ISODate, type UnavailStatus } from "@domain";
import { evaluateCached, useEvaluation, useViewState } from "../../derive.ts";
import { useApp } from "../../store.ts";
import { Chip, Section } from "../../ui/primitives.tsx";
import { codeOf, choiceFor, commitEdits, describeChoice, nameOf, shortDate, useLock } from "./lib.ts";
import { fmtDate } from "../../copy.ts";
import { shortName } from "../../names.ts";
import { Act, Disclosure } from "./ui.tsx";

const FIRST = 3;

export function PharmacistDay({ pharmacistId, date }: { pharmacistId: string; date: ISODate }) {
  const vs = useViewState();
  const winEv = useEvaluation();
  const asOf = useApp((s) => s.asOf);
  const lock = useLock();
  const [all, setAll] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const state = vs?.state;
  const dayEv = useMemo(() => (state ? evaluateCached(state, asOf, { range: { from: date, to: date }, window: { from: date, to: date }, ...(vs?.scenario ? { includeRequested: true } : {}) }) : null), [state, vs?.scenario, asOf, date]);
  const rows = useMemo(() => {
    if (!state || !dayEv) return [];
    const idx = indexRequirements(state);
    const prepared = prepareChoices(state, date, asOf, dayEv);
    const out = Object.values(state.stores)
      .filter((s) => requiredFor(state, idx, s.id, date) > 0)
      .map((s) => {
        const choice = choiceFor(state, asOf, pharmacistId, s.id, date, dayEv, prepared);
        const cell = dayEv.cells[`${s.id}|${date}`];
        return choice ? { store: s, choice, open: cell?.open ?? 0 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const rank = (r: (typeof out)[number]) => (r.choice.blocks.length ? 4 : 0) + (r.open > 0 ? 0 : 2) + (r.choice.warns.length || r.choice.unknown.length ? 1 : 0);
    return out.sort((a, b) => rank(a) - rank(b) || (a.choice.travelMinutes ?? 9999) - (b.choice.travelMinutes ?? 9999) || (a.store.code < b.store.code ? -1 : 1));
  }, [state, dayEv, asOf, pharmacistId, date]);

  void winEv;
  if (!state || !dayEv) return null;
  const ph = state.pharmacists[pharmacistId];
  if (!ph) return <p className="p-3 text-sm text-muted">That pharmacist is not in the schedule any more.</p>;

  const mine = Object.values(state.assignments).filter((a) => a.pharmacistId === pharmacistId && a.date === date);
  const records = Object.values(state.unavailability)
    .filter((u) => u.pharmacistId === pharmacistId && u.first <= date && date <= u.last)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const base = ph.baseStoreId ? state.stores[ph.baseStoreId] : undefined;
  const licensed = ph.licenses ? Object.keys(ph.licenses).sort().join(", ") : null;
  const list = all ? rows : rows.slice(0, FIRST);
  const setStatus = (id: string, status: UnavailStatus) => commitEdits([{ t: "unavail.update", id, patch: { status } }], `${status === "Denied" ? "Denied" : "Approved"} time off for ${ph.name}`);

  const where = mine.length === 0 ? "Not scheduled this day" : mine.length === 1 ? `At ${codeOf(state, mine[0]!.storeId)}` : `Booked at ${mine.map((m) => codeOf(state, m.storeId)).join(" and ")}`;

  return (
    <div>
      <header className="border-b border-line px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold" title={ph.name}>{shortName(ph.name, 28)}</h2>
          <button type="button" onClick={() => useApp.getState().select(null)} className="shrink-0 rounded-md px-1.5 text-xs text-muted underline focus-visible:outline-2 focus-visible:outline-ink" aria-label="Clear the selection">Clear</button>
        </div>
        <p className="mt-0.5 text-sm text-muted">{fmtDate(date)}{date < asOf ? " (past)" : ""}</p>
        <p className="text-sm font-semibold" data-testid="pharmacist-where">{where}</p>
      </header>

      <Section title="Where they are">
        {mine.length === 0 ? <p className="text-sm text-muted">Not scheduled anywhere this day.</p> : (
          <ul className="flex flex-col gap-1.5">
            {mine.map((a) => {
              const res = dayEv.assignments[a.id];
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <strong>{codeOf(state, a.storeId)}</strong> {state.stores[a.storeId]?.name}
                    {res && !res.counts ? <Chip tone="serious" className="ml-1.5">! Does not count</Chip> : null}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    <Act onClick={() => useApp.getState().select({ storeId: a.storeId, date })}>Open store day</Act>
                    {removing === a.id
                      ? <Act tone="danger" disabled={!!lock} title={lock ?? undefined} onClick={() => { if (commitEdits([{ t: "remove", assignmentId: a.id }], `Removed ${ph.name} from ${codeOf(state, a.storeId)}`)) setRemoving(null); }}>Yes, remove</Act>
                      : <Act disabled={!!lock} title={lock ?? undefined} onClick={() => setRemoving(a.id)}>Remove</Act>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <div className="px-3 py-2">
        <Disclosure label="More for this day">
        <p className="text-xs text-muted">
          {base ? `Based at ${base.code} (${base.name}${base.state ? `, ${base.state}` : ""}).` : "No base store recorded, so drive times are not checked."}
          {licensed !== null ? ` Licensed in ${licensed || "no state"}.` : " Licensing not recorded."}
        </p>
        {mine.length > 0 && base && mine.map((a) => {
          if (a.storeId === base.id) return null;
          const pair = state.travel[`${base.id}|${a.storeId}`];
          return <p key={a.id} className="text-xs text-muted">Drive from {base.code} to {codeOf(state, a.storeId)}: {pair ? `${pair.minutes} min` : "not known"}.</p>;
        })}

      <div className="mb-3"><h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Time off covering this day</h3>
        {records.length === 0 ? <p className="text-sm text-muted">Nothing recorded for this day.</p> : (
          <ul className="flex flex-col gap-2">
            {records.map((u) => (
              <li key={u.id} className="rounded-md bg-white p-2 ring-1 ring-line">
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-semibold">{u.type === "Turned-down" ? "Turned down" : u.type}</span>
                  <Chip tone={u.status === "Approved" || u.status === "Actual" ? "ok" : u.status === "Requested" ? "warning" : "neutral"}>
                    {u.status === "Approved" || u.status === "Actual" ? "✓ " : u.status === "Requested" ? "? " : ""}{u.status === "Requested" ? "Asked, not decided" : u.status}
                  </Chip>
                </div>
                <p className="text-xs text-muted">
                  {u.first === u.last ? shortDate(u.first) : `${shortDate(u.first)} to ${shortDate(u.last)}`}
                  {u.scopeStoreId ? `, only at ${codeOf(state, u.scopeStoreId)}` : ""}
                </p>
                {u.note && <p className="text-sm">{u.note}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(u.status === "Requested" || u.status === "Denied") && <Act disabled={!!lock} title={lock ?? undefined} onClick={() => setStatus(u.id, "Approved")}>Approve</Act>}
                  {u.status === "Requested" && <Act disabled={!!lock} title={lock ?? undefined} onClick={() => setStatus(u.id, "Denied")}>Deny</Act>}
                  {removing === u.id
                    ? <Act tone="danger" disabled={!!lock} title={lock ?? undefined} onClick={() => { if (commitEdits([{ t: "unavail.remove", id: u.id }], `Removed time off for ${ph.name}`)) setRemoving(null); }}>Yes, remove the record</Act>
                    : <Act disabled={!!lock} title={lock ?? undefined} onClick={() => setRemoving(u.id)}>Remove</Act>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>


      <div><h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Schedule at a store</h3>
        <ul className="flex flex-col divide-y divide-line" aria-label="Stores where they could work">
          {list.map(({ store, choice, open }) => {
            const p = describeChoice(state, choice, store.id, date);
            const blocked = choice.blocks.length > 0;
            const hard = blocked && (p.hard || choice.blocks.includes("licensing"));
            const verb = choice.action === "move" ? "Move here" : "Place";
            return (
              <li key={store.id} className="py-1.5" data-store={store.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold" title={store.name}>{store.code} <span className="font-normal text-muted">{store.name}</span></div>
                    <p className="text-xs text-muted">{open > 0 ? `Needs ${open} more` : "Already covered"}</p>
                    <div className="flex gap-1.5 text-xs"><Chip tone={p.tone} className="shrink-0 self-start">{p.glyph}</Chip><span className="min-w-0">{p.text}</span></div>
                  </div>
                  {hard
                    ? <Act disabled title={p.text} aria-label={`${verb} at ${store.code}: not allowed. ${p.text}`}>{verb}</Act>
                    : <Act tone={blocked ? "quiet" : "ink"} disabled={!!lock} title={lock ?? (blocked ? "They would not count until you accept the problem" : undefined)} className="shrink-0" aria-label={`${blocked ? `${verb} anyway` : verb} at ${store.code}`}
                        onClick={() => commitEdits(choice.action === "move" && choice.assignmentId ? [{ t: "move", assignmentId: choice.assignmentId, toStoreId: store.id }] : [{ t: "place", storeId: store.id, pharmacistId, date }], `${choice.action === "move" ? "Moved" : "Scheduled"} ${nameOf(state, pharmacistId)} at ${store.code}`)}>
                        {blocked ? `${verb} anyway` : verb}
                      </Act>}
                </div>
              </li>
            );
          })}
        </ul>
        {rows.length > FIRST && <div className="mt-1.5"><Act onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${rows.length}`}</Act></div>}
        {rows.length === 0 && <p className="text-sm text-muted">No other store is open this day.</p>}
      </div>
        </Disclosure>
      </div>
    </div>
  );
}
