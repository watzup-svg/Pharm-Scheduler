// First run: a brand-new schedule has no stores yet. One line and the two places to start.
import { Btn } from "../../ui/primitives.tsx";
import { openSetup } from "./actions.ts";

export function Welcome({ hasStores }: { hasStores: boolean }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center" data-welcome>
      <h2 className="text-2xl font-semibold">Welcome</h2>
      <p className="mt-2 text-muted">{hasStores ? "Your stores are in. Add your pharmacists next." : "This schedule is empty. Start with your stores, then add your pharmacists."}</p>
      <div className="mt-6 flex justify-center gap-2">
        {!hasStores && <Btn tone="ink" onClick={() => openSetup("stores")}>Add stores</Btn>}
        <Btn tone={hasStores ? "ink" : "quiet"} onClick={() => openSetup("pharmacists")}>Add pharmacists</Btn>
      </div>
    </div>
  );
}
