// Overview: how the month stands and what to do next, in ten seconds. Read and jump: it never changes the schedule by itself.
import { useApp } from "../store.ts";
import { PageFrame } from "../ui/PageFrame.tsx";
import { useViewState } from "../derive.ts";
import { useChecklist, useMonthFacts, useNextMonth } from "./overview/facts.ts";
import { ThinMonth } from "./overview/ThinMonth.tsx";
import { NextUp } from "./overview/NextUp.tsx";
import { Checklist } from "./overview/Checklist.tsx";
import { StartNextMonth } from "./overview/StartNextMonth.tsx";
import { Welcome } from "./overview/Welcome.tsx";
import { Changed, ComingUp } from "./overview/Briefing.tsx";

export function Overview() {
  const world = useApp((s) => s.world);
  const vs = useViewState();
  const m = useMonthFacts();
  const items = useChecklist(m);
  const next = useNextMonth(m?.ym ?? "2000-01");
  if (!world || !vs || !m) return null;
  const stores = Object.keys(vs.state.stores).length;
  const people = Object.keys(vs.state.pharmacists).length;
  if (stores === 0 || (people === 0 && Object.keys(vs.state.assignments).length === 0)) return <Welcome hasStores={stores > 0} />;
  return (
    <PageFrame data-overview="">
    <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)] gap-12">
      <div className="flex flex-col gap-8">
        <section aria-labelledby="ov-month">
          <h2 id="ov-month" className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Stores, day by day</h2>
          <ThinMonth state={vs.state} ev={m.ev} ym={m.ym} asOf={m.asOf} />
        </section>
        <div className="grid grid-cols-2 gap-4"><Changed /><ComingUp /></div>
        <StartNextMonth ym={m.ym} asOf={m.asOf} next={next} />
      </div>
      <div className="flex flex-col gap-8">
        <NextUp m={m} />
        <Checklist items={items} />
      </div>
    </div>
    </PageFrame>
  );
}
