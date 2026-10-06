// Cell controls: accept being short, locum cover, and changing what this day needs (close, extra clinic, reopen). All inline.
import { useMemo, useState } from "react";
import { indexRequirements, requiredFor } from "@domain";
import { codeOf, commitEdits, type Ctx } from "./lib.ts";
import { Act, Stepper, TextField } from "./ui.tsx";

type Form = null | "close" | "clinic" | "open";

export function CellControls({ ctx }: { ctx: Ctx }) {
  const { state, lock, storeId, date, cv } = ctx;
  const key = `${storeId}|${date}`;
  const override = state.dateOverrides[key];
  const usual = useMemo(() => {
    const { [key]: _gone, ...rest } = state.dateOverrides;
    void _gone;
    const s = { ...state, dateOverrides: rest };
    return requiredFor(s, indexRequirements(s), storeId, date);
  }, [state, key, storeId, date]);
  const [form, setForm] = useState<Form>(null);
  const [note, setNote] = useState("");
  const [n, setN] = useState(1);
  const code = codeOf(state, storeId);
  const title = lock ?? undefined;

  const setCount = (patch: { acceptedShort?: number; locum?: number }, what: string) =>
    commitEdits([{ t: "cell.set", storeId, date, ...patch }], `${what} at ${code}`);

  const save = () => {
    const count = form === "close" ? 0 : form === "clinic" ? usual + n : n;
    const label = form === "close" ? `Closed ${code}` : form === "clinic" ? `Extra clinic at ${code}` : `Opened ${code}`;
    if (commitEdits([{ t: "dateOverride.set", storeId, date, count, note: note.trim() }], `${label}: ${note.trim()}`)) { setForm(null); setNote(""); setN(1); }
  };
  const open = (f: Form) => { setForm(form === f ? null : f); setNote(""); setN(1); };

  const dayText = override
    ? override.count === 0 ? `Closed this day${override.note ? `: ${override.note}` : "."}` : `Needs ${override.count} instead of the usual ${usual}${override.note ? `: ${override.note}` : "."}`
    : null;

  return (
    <div>
      <Stepper
        label="Accept being short" value={cv.acceptedShort} max={Math.max(cv.required, cv.acceptedShort)} disabled={!!lock || cv.required === 0} title={title}
        onChange={(v) => setCount({ acceptedShort: v }, "Accepted short")}
      />
      <Stepper label="Locum cover" value={cv.locum} max={9} disabled={!!lock} title={title} onChange={(v) => setCount({ locum: v }, "Locum")} />

      <div className="mt-2 border-t border-line pt-2">
        {dayText && <p className="text-sm" data-testid="override-text">{dayText}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {override && (
            <Act disabled={!!lock} title={title} onClick={() => commitEdits([{ t: "dateOverride.clear", storeId, date }], `Back to the usual at ${code}`)}>
              {override.count === 0 ? "Reopen" : "Back to the usual"}
            </Act>
          )}
          {cv.required > 0 && (
            <Act disabled={!!lock} title={title} pressed={form === "close"} onClick={() => open("close")}>Close this store this day</Act>
          )}
          <Act disabled={!!lock || usual === 0} title={lock ?? (usual === 0 ? "The store is not open this day" : undefined)} pressed={form === "clinic"} onClick={() => open("clinic")}>Extra clinic (+{n})</Act>
          {!override && usual === 0 && <Act disabled={!!lock} title={title} pressed={form === "open"} onClick={() => open("open")}>Open this day</Act>}
        </div>
        {form && (
          <div className="mt-2 rounded-md bg-fill p-2" role="group" aria-label={form === "close" ? "Close this day" : form === "clinic" ? "Extra clinic" : "Open this day"}>
            {form === "clinic" && <Stepper label="Extra pharmacists needed" value={n} min={1} max={4} onChange={setN} />}
            {form === "open" && <Stepper label="Pharmacists needed" value={n} min={1} max={4} onChange={setN} />}
            <TextField label="Note (holiday, inventory, clinic...)" value={note} onChange={setNote} autoFocus onEscape={() => setForm(null)} onEnter={() => { if (note.trim()) save(); }} />
            <div className="mt-1.5 flex gap-1.5">
              <Act tone="ink" disabled={!note.trim() || !!lock} title={!note.trim() ? "Write a note first" : title} onClick={save}>
                {form === "close" ? "Close the day" : form === "clinic" ? `Save extra clinic (+${n})` : "Open the day"}
              </Act>
              <Act onClick={() => setForm(null)}>Cancel</Act>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
