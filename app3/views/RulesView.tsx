// Rules: the registry as a table (no logic here), and the thresholds the rules read.
import { ENGINE_VERSION, RULES } from "@domain";
import { useApp } from "../store.ts";
import { Chip } from "../ui/primitives.tsx";
import { Title } from "./chrome/Title.tsx";
import { ConfigForm } from "./rules/ConfigForm.tsx";

const yn = (b: boolean) => (b ? "Yes" : "No");

export function RulesView() {
  const world = useApp((s) => s.world);
  if (!world) return null;
  const cfg = world.state.config;
  return (
    <div className="px-4 py-3">
      <Title tip="Licensing can never be overridden. | The engine never proposes an override, except on rules marked “Engine may suggest”, and then only as a suggestion you accept. | Presence rules decide whether someone counts toward covering a store. Policy rules only warn; they never change the count.">Rules</Title>
      <p className="mt-0.5 text-sm text-muted">Licensing can never be overridden.</p>

      <div className="mt-3 overflow-x-auto rounded-md border border-line bg-cream">
        <table className="w-full border-collapse text-sm" aria-label="Rules">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="px-2 py-1.5 font-semibold">Rule</th>
              <th scope="col" className="px-2 font-semibold">Kind</th>
              <th scope="col" className="px-2 font-semibold">Severity</th>
              <th scope="col" className="px-2 font-semibold">Can be overridden</th>
              <th scope="col" className="px-2 font-semibold">Reason required</th>
              <th scope="col" className="px-2 font-semibold">Engine may suggest</th>
              <th scope="col" className="px-2 font-semibold">What to do</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((r) => (
              <tr key={r.id} data-rule={r.id} className="border-b border-line/60 align-top last:border-0">
                <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                  {r.message}
                  <div className="text-xs font-normal text-muted">{r.id}</div>
                </th>
                <td className="px-2 py-1.5">{r.kind === "presence" ? "Presence" : "Policy"}</td>
                <td className="px-2 py-1.5">
                  {r.severity === "serious" ? <Chip tone="serious" className="whitespace-nowrap">! Serious</Chip> : <Chip tone="warning" className="whitespace-nowrap">▲ Warning</Chip>}
                </td>
                <td className="px-2 py-1.5">{yn(r.overridable)}</td>
                <td className="px-2 py-1.5">{yn(r.reasonRequired)}</td>
                <td className="px-2 py-1.5">{yn(r.suggestible)}</td>
                <td className="px-2 py-1.5">{r.fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="cfg-h" className="mt-6">
        <Title id="cfg-h" className="text-base font-semibold" tip="A limit applies to the whole schedule at once. | Undo it from History.">Limits and settings</Title>
        <ConfigForm key={JSON.stringify(cfg)} config={cfg} />
      </section>

      <p className="mt-6 text-xs text-muted" data-testid="engine-version">Engine version {ENGINE_VERSION}</p>
    </div>
  );
}
