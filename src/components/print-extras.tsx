import { Copy, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { changesSince, PRINTED_KEY, type PrintSnapshot } from "@/lib/schedule/changes";
import { monthKey } from "@/lib/schedule/archive";
import { downloadText } from "@/lib/schedule/file";
import { personIcs, personText } from "@/lib/schedule/ics";
import type { ScheduleDoc } from "@/lib/schedule/types";

export function readPrinted(ym: string): PrintSnapshot | null {
  try {
    const raw = localStorage.getItem(PRINTED_KEY);
    if (!raw) return null;
    return ((JSON.parse(raw) as Record<string, PrintSnapshot>)[ym] as PrintSnapshot | undefined) ?? null;
  } catch {
    return null;
  }
}

function rangeText(days: number[]): string {
  return days.join(", ");
}

/** What is different from the pages that were last printed, so only those pages need printing again. */
export function SinceLastPrint({
  doc,
  version,
  onlyChanged,
}: {
  doc: ScheduleDoc;
  /** Bumps after a print so this re-reads what was recorded. */
  version: number;
  onlyChanged: (stores: string[], people: string[]) => void;
}) {
  // `version` is not read inside, but a change means a print was just recorded, so read it again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => readPrinted(monthKey(doc.year, doc.month)), [doc.year, doc.month, version]);
  const changes = useMemo(() => changesSince(doc, snap), [doc, snap]);
  const stores = Object.keys(changes.stores);
  const people = Object.keys(changes.people).filter((n) => doc.people.some((p) => p.name === n));
  // Nothing printed yet means nothing to compare with.
  if (!snap) return null;
  return (
    <section aria-label="Since you last printed" className="surface p-4 sm:p-5">
      <h2 className="text-base font-semibold">Since you last printed</h2>
      {!snap ? (
        <p className="mt-1 text-sm text-muted">Nothing printed or saved from this computer for this month yet. After you do, later changes are listed here.</p>
      ) : changes.cells === 0 ? (
        <p className="mt-1 text-sm text-muted">Nothing has changed since {new Date(snap.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. The pages you printed are still right.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-pretty">
            {changes.cells} {changes.cells === 1 ? "change" : "changes"} since {new Date(snap.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Reprint {stores.length} {stores.length === 1 ? "poster" : "posters"} and {people.length} {people.length === 1 ? "calendar" : "calendars"}; the rest are unchanged.
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
            {stores.map((c) => (
              <li key={c}>
                <span className="font-medium">{c}</span> <span className="text-muted">day {rangeText(changes.stores[c]!)}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
            {people.map((n) => (
              <li key={n}>
                <span className="font-medium">{n}</span> <span className="text-muted">day {rangeText(changes.people[n]!)}</span>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => onlyChanged(stores, people)}>
            Choose only what changed
          </Button>
        </>
      )}
    </section>
  );
}

/** One pharmacist's schedule as a calendar file and as a short message they can paste anywhere. */
export function SendSchedules({ doc, names }: { doc: ScheduleDoc; names: string[] }) {
  const [name, setName] = useState(names[0] ?? "");
  const who = names.includes(name) ? name : (names[0] ?? "");
  const text = useMemo(() => (who ? personText(doc, who) : ""), [doc, who]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied. Paste it into a text or email.");
    } catch {
      toast.message("Could not copy on its own. Select the text below and copy it.");
    }
  }

  function ics() {
    const file = `${who.replace(/[^A-Za-z0-9]+/g, "_")}_${doc.year}-${String(doc.month).padStart(2, "0")}.ics`;
    downloadText(personIcs(doc, who), file, "text/calendar");
    toast.success(`Saved ${file}. Opening it adds the days to their calendar.`);
  }

  if (!names.length) return null;
  return (
    <section aria-label="Send a schedule" className="p-4 sm:p-5">
      <div className="max-w-sm">
        <Label htmlFor="send-person">Pharmacist</Label>
        <NativeSelect id="send-person" value={who} onChange={(e) => setName(e.target.value)}>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Textarea
        readOnly
        aria-label="Message to send"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        rows={6}
        className="mt-3"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          <Copy />
          Copy the message
        </Button>
        <Button type="button" variant="secondary" onClick={ics}>
          <Download />
          Save calendar file (.ics)
        </Button>
      </div>
    </section>
  );
}
