import { Mark } from "@/components/icons";
import { doubleKey, holeKey, leftoverKey, secondKey } from "@/lib/schedule/rules";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { monthName } from "@/lib/schedule/calendar";
import { type HoleChoice } from "@/lib/schedule/dashboard";
import { timeOffImpact } from "@/lib/schedule/impact";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

/** Who is left out of the list because they can't be offered for this state, and why, so nothing is silently missing. */
export function NotOffered({ choices }: { choices: HoleChoice[] }) {
  const doc = useScheduleStore((s) => s.doc);
  const updatePerson = useScheduleStore((s) => s.updatePerson);
  const lacks = choices.filter((c) => c.licence === "lacks");
  const unrecorded = choices.filter((c) => c.licence === "unrecorded" && c.state !== "blocked");
  if (!lacks.length && !unrecorded.length) return null;
  const state = (lacks[0] ?? unrecorded[0])!.licenceState;
  return (
    <details className="px-1 text-xs text-muted">
      <summary className="flex min-h-11 cursor-pointer items-center underline">
        Not shown: {lacks.length + unrecorded.length} can’t be offered for {state}
      </summary>
      <div className="flex flex-col gap-1 pb-2">
        {lacks.length ? (
          <p>
            <span className="font-semibold text-illegal">Not licensed in {state}:</span> {lacks.map((c) => c.name).join(", ")}
          </p>
        ) : null}
        {unrecorded.length ? (
          <p>
            <span className="font-semibold text-warn">No {state} license on file:</span> {unrecorded.map((c) => c.name).join(", ")}. If you know they’re licensed, record it and they’ll be offered.
          </p>
        ) : null}
        {unrecorded.length ? (
          <div className="flex flex-wrap gap-2">
            {unrecorded.map((c) => {
              const p = doc.people.find((x) => x.name === c.name);
              if (!p) return null;
              return (
                <Button
                  key={c.name}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-auto min-h-11 py-2 whitespace-normal"
                  onClick={() => {
                    updatePerson(p.name, { ...p, licensedStates: [...new Set([...(p.licensedStates ?? []), c.licenceState])] });
                    announce(`${p.name} recorded as licensed in ${c.licenceState}`);
                  }}
                >
                  {c.name.split(" ")[0]} is licensed in {c.licenceState}
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** What approving or adding time off would leave with nobody. Suggestions only. */
export function ImpactList({ items }: { items: ReturnType<typeof timeOffImpact> }) {
  const doc = useScheduleStore((s) => s.doc);
  if (items.length === 0) return <p className="rounded-lg bg-ok-bg px-3 py-2 text-xs text-ok">Nothing would be left uncovered.</p>;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-illegal-bg px-3 py-2 text-xs" role="status">
      <p className="font-semibold text-illegal">
        This would leave {items.length} {items.length === 1 ? "shift" : "shifts"} with no coverage:
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((i) => (
          <li key={`${i.store}|${i.day}|${i.slot}`} className="text-pretty">
            <span className="font-medium">
              {i.storeName}, {monthName(doc.year, doc.month).slice(0, 3)} {i.day}
            </span>
            <span className="text-muted">
              {i.suggestions.length ? ` · could cover: ${i.suggestions.map((s) => s.name).join(", ")}` : " · no one free to cover"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Close this sheet and open the "someone is out" helper (sick or time off, then find cover) on this person and day. */
export function OutButton({ name, knownReason }: { name: string; knownReason: boolean }) {
  const day = useViewStore((s) => s.sheet?.day ?? 0);
  const closeSheet = useViewStore((s) => s.closeSheet);
  const openSick = useViewStore((s) => s.openSick);
  return (
    <Button
      type="button"
      variant="away"
      size="sm"
      onClick={() => {
        closeSheet();
        openSick({ name, day });
      }}
    >
      <Mark icon="timeOff" tip={false} />
      {knownReason ? "Find cover…" : "Out that day…"}
    </Button>
  );
}

export function acceptKeyFor(step: { kind: string; names: string[]; day: number }, store: string, day: number): string {
  if (step.kind === "double") return doubleKey(step.names[0]!, day);
  if (step.kind === "leftover") return leftoverKey(store, day);
  if (step.kind === "second") return secondKey(store, day);
  return holeKey(store, day);
}
