// The engine's helpers in one quiet menu: Build, Improve and Cover all open. Each only proposes; nothing is saved until Accept.
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { useApp } from "../store.ts";
import { useIssues } from "../derive.ts";
import { Btn } from "./primitives.tsx";

export function ToolsMenu({ className }: { className?: string }) {
  const busy = useApp((s) => s.busy);
  const proposal = useApp((s) => !!s.world?.session.proposal);
  const scenario = useApp((s) => !!s.world?.session.scenario && !s.world.session.scenario.parked);
  const issues = useIssues();
  const [improve, setImprove] = useState(false);
  const [next14, setNext14] = useState(false);
  const off = !!busy || proposal || scenario || !!useApp.getState().readOnlyProblems;
  const why = busy ? `${busy} is running.` : proposal ? "Accept or discard the preview first." : scenario ? "A what-if is open." : undefined;
  const coverAll = () => {
    const gaps = issues.filter((i) => i.kind === "open").slice(0, 5).map((i) => ({ storeId: i.storeId, date: i.date }));
    if (gaps.length) void useApp.getState().runRepair(gaps, false);
    useApp.getState().setDrawer(true, "queue");
  };
  return (
    <>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Btn className={className} title={why} aria-label="Tools">{busy ? `${busy}…` : "Tools ▾"}</Btn>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="end" sideOffset={4} className="z-50 min-w-[230px] rounded-lg bg-white p-1 text-sm shadow-xl ring-1 ring-black/10">
            <Menu.Item disabled={off} onSelect={() => void useApp.getState().runBuild()} className="cursor-pointer rounded px-3 py-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-fill">Build this period<span className="block text-xs text-muted">Fill from patterns and look for cover</span></Menu.Item>
            <Menu.Item disabled={off} onSelect={() => setImprove(true)} className="cursor-pointer rounded px-3 py-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-fill">Improve…<span className="block text-xs text-muted">Fewer problems, shorter drives</span></Menu.Item>
            <Menu.Item disabled={off || !issues.some((i) => i.kind === "open")} onSelect={coverAll} className="cursor-pointer rounded px-3 py-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-fill">Cover all open<span className="block text-xs text-muted">Up to 5 gaps, in date order</span></Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {improve && (
        <div role="dialog" aria-label="Improve" className="fixed inset-0 z-50 grid place-items-center bg-black/30" onClick={() => setImprove(false)}>
          <div className="w-[440px] rounded-lg bg-cream p-4 shadow-xl ring-1 ring-black/10" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold">Improve</h2>
            <p className="mt-1 text-sm">Looks for swaps that restore patterns, remove problems and cut driving. It only runs when you ask, and nothing is saved until you accept.</p>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={next14} onChange={(e) => setNext14(e.target.checked)} /> Include the next 14 days</label>
            <div className="mt-4 flex justify-end gap-2">
              <Btn onClick={() => setImprove(false)}>Cancel</Btn>
              <Btn tone="ink" onClick={() => { setImprove(false); void useApp.getState().runImprove(next14); }}>Look for improvements</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
