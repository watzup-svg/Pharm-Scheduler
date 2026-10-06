// Time off: waiting requests first, then what is coming up, then adding someone. Past records sit under "Earlier".
import { useMemo, useState } from "react";
import type { ISODate, Unavailability, UnavailStatus } from "@domain";
import { useApp } from "../store.ts";
import { Btn, Chip, cx, type ChipTone } from "../ui/primitives.tsx";
import { codeOf, plural } from "./chrome/shared.tsx";
import { OutForm } from "./timeoff/OutForm.tsx";
import { openIfApproved, span } from "./timeoff/lib.ts";

const TONE: Record<UnavailStatus, ChipTone> = { Requested: "warning", Approved: "info", Actual: "info", Denied: "neutral" };
const MARK: Record<UnavailStatus, string> = { Requested: "? ", Approved: "✓ ", Actual: "✓ ", Denied: "– " };
const byDate = (a: Unavailability, b: Unavailability) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.id < b.id ? -1 : 1);

function Head({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-5 flex items-center justify-between">
      <h3 className="text-sm font-semibold">{children}</h3>
      {right}
    </div>
  );
}

export function TimeOff() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const [group, setGroup] = useState<"person" | "date">("person");
  const state = world?.state;
  const busy = !!world && (!!world.session.proposal || (!!world.session.scenario && !world.session.scenario.parked));

  const all = useMemo(() => (state ? Object.values(state.unavailability).sort(byDate) : []), [state]);
  const waiting = all.filter((u) => u.status === "Requested" && u.last >= asOf);
  const upcoming = all.filter((u) => u.status !== "Requested" && u.last >= asOf);
  const earlier = all.filter((u) => u.last < asOf).reverse();
  const previews = useMemo(() => {
    const m = new Map<string, number>();
    if (state) for (const u of waiting) m.set(u.id, openIfApproved(state, u, asOf));
    return m;
  }, [state, waiting, asOf]);
  if (!world || !state) return null;

  const nameOf = (u: Unavailability) => state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId;
  const update = (u: Unavailability, st: UnavailStatus) => useApp.getState().commit([{ t: "unavail.update", id: u.id, patch: { status: st } }], `Time off ${st.toLowerCase()} for ${nameOf(u)}.`);
  const remove = (u: Unavailability) => useApp.getState().commit([{ t: "unavail.remove", id: u.id }], `Time off removed for ${nameOf(u)}.`);

  const kind = (u: Unavailability) => `${u.type}${u.scopeStoreId ? ` at ${codeOf(state, u.scopeStoreId)}` : ""}`;
  const Row = ({ u, actions, note }: { u: Unavailability; actions: React.ReactNode; note?: string }) => (
    <li className="flex items-center gap-3 rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line" data-unavail={u.id}>
      <span className="w-44 shrink-0 truncate font-semibold" title={nameOf(u)}>{nameOf(u)}</span>
      <span className="min-w-0 flex-1 text-muted"><span className="block truncate">{span(u)} · {kind(u)}</span>{note && <span className="block text-ink">{note}</span>}</span>
      <Chip tone={TONE[u.status]}>{MARK[u.status]}{u.status}</Chip>
      <span className="flex shrink-0 gap-1">{actions}</span>
    </li>
  );
  const removeBtn = (u: Unavailability) => <Btn tone="ghost" aria-label={`Remove: ${nameOf(u)} ${span(u)}`} disabled={busy} onClick={() => remove(u)}>Remove</Btn>;

  const groups = useMemo(() => {
    const m = new Map<string, Unavailability[]>();
    for (const u of upcoming) {
      const k = group === "person" ? state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId : u.first;
      m.set(k, [...(m.get(k) ?? []), u]);
    }
    const keys = [...m.keys()].sort((a, b) => a.localeCompare(b, "en"));
    return keys.map((k) => ({ key: k, rows: m.get(k)! }));
  }, [upcoming, group, state]);
  const groupTitle = (k: string) => (group === "person" ? k : span({ first: k as ISODate, last: k as ISODate }));

  return (
    <div className="mx-auto max-w-[760px] px-4 pb-8 pt-2">
      <h2 className="sr-only">Time off</h2>
      <p className="text-sm text-muted">{waiting.length === 0 ? "Nothing is waiting." : `${waiting.length} waiting for an answer.`} {plural(upcoming.length, "approved record")} from {span({ first: asOf, last: asOf })} on.</p>

      <Head>Waiting</Head>
      {waiting.length === 0 ? (
        <p className="text-sm text-muted">No requests are waiting.</p>
      ) : (
        <ul className="space-y-1.5" aria-label="Waiting for an answer">
          {waiting.map((u) => {
            const n = previews.get(u.id) ?? 0;
            return (
              <Row
                key={u.id}
                u={u}
                note={n === 0 ? "If approved: no cells open" : `If approved: ${plural(n, "cell")} open`}
                actions={
                  <>
                    <Btn aria-label={`Approve: ${nameOf(u)} ${span(u)}`} disabled={busy} onClick={() => update(u, "Approved")}>Approve</Btn>
                    <Btn aria-label={`Deny: ${nameOf(u)} ${span(u)}`} disabled={busy} onClick={() => update(u, "Denied")}>Deny</Btn>
                    {removeBtn(u)}
                  </>
                }
              />
            );
          })}
        </ul>
      )}

      <Head
        right={
          <div role="group" aria-label="Group by" className="flex gap-0.5 text-xs">
            {(["person", "date"] as const).map((g) => (
              <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={cx("rounded px-2 py-0.5 font-medium focus-visible:outline-2 focus-visible:outline-ink", group === g ? "bg-ink text-white" : "text-muted hover:bg-fill")}>
                By {g}
              </button>
            ))}
          </div>
        }
      >
        Upcoming
      </Head>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted">Nobody is booked off from {span({ first: asOf, last: asOf })} on.</p>
      ) : (
        <div className="space-y-2" aria-label="Upcoming time off">
          {groups.map((g) => (
            <section key={g.key} aria-label={groupTitle(g.key)}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{groupTitle(g.key)}</h4>
              <ul className="space-y-1">
                {g.rows.map((u) => (
                  <Row
                    key={u.id}
                    u={u}
                    actions={
                      <>
                        {u.status === "Denied" && <Btn aria-label={`Approve: ${nameOf(u)} ${span(u)}`} disabled={busy} onClick={() => update(u, "Approved")}>Approve</Btn>}
                        {removeBtn(u)}
                      </>
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {earlier.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-muted focus-visible:outline-2 focus-visible:outline-ink">Earlier ({earlier.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {earlier.map((u) => <Row key={u.id} u={u} actions={removeBtn(u)} />)}
          </ul>
        </details>
      )}

      <Head>Add</Head>
      <div className="max-w-[420px] rounded-md bg-cream p-3 ring-1 ring-line">
        <OutForm label="Add to the time off list" />
      </div>
    </div>
  );
}
