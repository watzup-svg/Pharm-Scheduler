import { useMemo } from "react";
import { toast } from "sonner";
import { Mark, reasonIcon } from "@/components/icons";
import { HoldButton } from "@/components/ui/hold-button";
import { whyOut } from "@/lib/schedule/why-out";
import { announce } from "@/components/undo";
import { ActionBar } from "@/components/ui/action-bar";
import { stateName } from "@/lib/schedule/licence";
import { confirmAction } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { ShorterDrives } from "@/components/cover-plans";
import { stateOfStore } from "@/lib/schedule/licence";
import { storeLabel } from "@/lib/schedule/fix";
import { getCell } from "@/lib/schedule/grid";
import { issueKey } from "@/lib/schedule/rules";
import { plannedFillSlot } from "@/lib/schedule/stamp";
import type { SlotId } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";
import { CoverCard, phoneOf } from "@/components/day-sheet-picker";
import { OutButton } from "@/components/day-sheet-extras";

const SLOT_LABEL: Record<string, string> = {
  pharmacist: "Pharmacist",
  pharmacist2: "Second pharmacist",
};

export function SlotBlock({
  slot,
  open,
  picking,
  seed,
  onPick,
  onChoose,
  onClear,
  onFill,
  onDone,
  exclude,
}: {
  slot: SlotId;
  open: boolean;
  picking: boolean;
  seed: string;
  onPick: () => void;
  onChoose: (name: string) => void;
  onClear: (name: string) => void;
  onFill: () => void;
  onDone: () => void;
  exclude: string[];
}) {
  const sheet = useViewStore((s) => s.sheet)!;
  const doc = useScheduleStore((s) => s.doc);
  const { store, day } = sheet;
  const name = getCell(doc.grid, store, slot, day).trim();
  // A name in two places is resolved by the "Keep …" choices above, so a separate Clear would only repeat one of them.
  const doubled = useScheduleStore((s) => Boolean(name && s.evaluation.byKey[issueKey(store, day)]?.doubledNames.includes(name)));
  const onTimeOff = useScheduleStore((s) => Boolean(name && s.evaluation.byKey[issueKey(store, day)]?.ptoNames.includes(name)));
  const why = useMemo(() => whyOut(doc, store, day, name), [doc, store, day, name]);
  // A licence the file does not know about: record it here instead of hunting through Setup. The problem stays until the record says so.
  const unlicensed = useScheduleStore((s) => Boolean(name && s.evaluation.byKey[issueKey(store, day)]?.unlicensedNames.includes(name)));
  const updatePerson = useScheduleStore((s) => s.updatePerson);
  const stateCode = stateOfStore(doc.stores.find((x) => x.code === store) ?? { address: "" });
  async function addLicence() {
    const person = doc.people.find((p) => p.name === name);
    if (!person || !stateCode) return;
    const ok = await confirmAction({
      title: `Record ${name.split(" ")[0]} as licensed in ${stateName(stateCode)}?`,
      body: "Only do this if it is true. The licence list is what the check reads; the problem clears because the record changed, not because it was set aside.",
      effects: [`${name} is added to ${stateName(stateCode)} on the People page. You can undo it.`],
      confirmLabel: "Add licence",
    });
    if (!ok) return;
    const err = updatePerson(name, { ...person, licensedStates: [...new Set([...(person.licensedStates ?? []), stateCode])] });
    if (err) toast.error(err);
    else announce(`${name} recorded as licensed in ${stateName(stateCode)}`);
  }
  const fillCount = name && open ? plannedFillSlot(doc, { store, slot, day }).length : 0;
  const storeName = storeLabel(doc, store);

  // An empty shift: the people who can cover it are the whole point, so they lead.
  if (!name && open) {
    return (
      <>
        {slot === "pharmacist" ? <ShorterDrives store={store} day={day} onDone={onDone} /> : null}
        <CoverCard slot={slot} seed={seed} onChoose={onChoose} exclude={exclude} />
      </>
    );
  }

  return (
    <>
    <div className="rounded-xl bg-white p-3 ring-1 ring-line">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">{SLOT_LABEL[slot]}</p>
          <p className={cn("text-pretty break-words text-base font-semibold", !name && "text-muted")}>{name || "No pharmacist"}</p>
        </div>
        {name && phoneOf(doc, name) ? (
          <a
            href={`tel:${phoneOf(doc, name).replace(/[^\d+]/g, "")}`}
            aria-label={`Call ${name} at ${phoneOf(doc, name)}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-md bg-fill text-ink ring-1 ring-edge hover:bg-shut"
          >
            <Mark icon="phone" className="size-5" />
          </a>
        ) : null}
      </div>
      {name || open ? (
        <ActionBar className="mt-2">
          {open ? (
            <Button type="button" variant={picking ? "default" : "secondary"} size="sm" onClick={onPick} aria-expanded={picking}>
              {name ? "Change person" : "Choose person"}
            </Button>
          ) : null}
          {name && open && !picking ? <OutButton name={name} knownReason={why.length > 0} /> : null}
          {unlicensed && stateCode ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => void addLicence()}>
              Add {stateCode} licence
            </Button>
          ) : null}
          {name && !doubled ? (
            <HoldButton variant="default" size="sm" onHold={() => onClear(name)}>
              Remove
            </HoldButton>
          ) : null}
        </ActionBar>
      ) : null}
      {open && why.length ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Why cover is needed">
          {why.map((w, i) => (
            <li
              key={`${w.name}-${i}`}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                "bg-warn-bg text-warn",
              )}
            >
              <Mark icon={w.kind === "sick" ? "sick" : reasonIcon(w.label)} className="size-3.5" />
              {name ? null : <span className="font-bold">{w.name.split(" ")[0]}</span>}
              {w.label}
            </li>
          ))}
        </ul>
      ) : null}
      {fillCount > 0 && !picking ? (
        <HoldButton variant="secondary" size="sm" className="mt-2 h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal" onHold={onFill} holdMs={900}>
          Schedule {name.split(" ")[0]} on {fillCount} more open {fillCount === 1 ? "day" : "days"} at {storeName}
        </HoldButton>
      ) : null}
    </div>
    {open && !picking && name && onTimeOff ? <CoverCard slot={slot} seed={seed} onChoose={onChoose} exclude={exclude} title={`Replace ${name.split(" ")[0]}`} /> : null}
    {picking && open ? <CoverCard slot={slot} seed={seed} onChoose={onChoose} title="Change to someone else" /> : null}
    </>
  );
}
