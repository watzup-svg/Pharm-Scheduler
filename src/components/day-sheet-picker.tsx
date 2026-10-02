import { Search, UserCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Suggestions } from "@/components/suggestions";
import { Mark, RoleMark, type IconKey } from "@/components/icons";
import { rankCandidates } from "@/lib/schedule/suggest";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isoDate, monthName } from "@/lib/schedule/calendar";
import { stateOfStore } from "@/lib/schedule/licence";
import { choicesFor, offerable, type HoleChoice } from "@/lib/schedule/dashboard";
import { nameMatch } from "@/lib/schedule/fix";
import type { SlotId } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";
import { useStoreTag } from "@/components/use-store-tag";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";
import { NotOffered } from "@/components/day-sheet-extras";

function tagFor(c: HoleChoice, label: (code: string) => string): { text: string; tone: "plain" | "double" | "off" | "here" | "blocked"; icon?: IconKey } {
  if (c.state === "blocked") return { text: `Not licensed in ${c.lacksLicence}`, tone: "blocked", icon: "licence" };
  if (c.licence === "unrecorded") return { text: `No ${c.licenceState} license on file`, tone: "blocked", icon: "licence" };
  if (c.here) return { text: "here now", tone: "here" };
  if (c.state === "off") return { text: "on time off", tone: "off", icon: "timeOff" };
  if (c.state === "dayoff") return { text: "usual day off", tone: "off", icon: "usualOff" };
  if (c.state === "double") return { text: c.elsewhereSolo.length ? `at ${c.elsewhere.map(label).join(", ")} · only one there` : `at ${c.elsewhere.map(label).join(", ")}`, tone: "double", icon: "elsewhere" };
  return { text: "free", tone: "plain" };
}

function Picker({
  slot,
  seed,
  onChoose,
  exclude = [],
}: {
  slot: SlotId;
  seed: string;
  onChoose: (name: string) => void;
  exclude?: string[];
}) {
  const sheet = useViewStore((s) => s.sheet)!;
  const doc = useScheduleStore((s) => s.doc);
  const storeTag = useStoreTag();
  const { store, day } = sheet;
  const [q, setQ] = useState(seed);
  const inputRef = useRef<HTMLInputElement>(null);
  const choices = useMemo(() => choicesFor(doc, store, day, slot), [doc, store, day, slot]);
  // With no search typed, the best few are shown above with reasons, so the list below is everyone else.
  const top = useMemo(
    () => (q.trim() ? [] : rankCandidates(doc, store, day, slot, { exclude }).filter((x) => x.state === "free").slice(0, 3).map((x) => x.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, store, day, slot, q, exclude.join("|")],
  );
  const shown = useMemo(() => {
    // Nobody who can't be offered for this state is listed, until their name is typed on purpose. Then they show with the reason,
    // last; "not licensed" can't be picked, "no license on file" can (you may know something the file doesn't).
    const rank = (c: HoleChoice) => (offerable(c) ? 0 : c.state === "blocked" ? 2 : 1);
    const pool = q.trim() ? choices : choices.filter(offerable);
    const ordered = [...pool].sort((a, b) => rank(a) - rank(b)).filter((c) => !top.includes(c.name));
    if (!q.trim()) return ordered;
    return ordered
      .map((c) => ({ c, m: nameMatch(c.name, q) }))
      .filter((x): x is { c: HoleChoice; m: NonNullable<ReturnType<typeof nameMatch>> } => x.m != null)
      .sort((a, b) => a.m.score - b.m.score || a.c.name.localeCompare(b.c.name))
      .map((x) => x.c);
  }, [choices, q, top]);

  // Only pull up the keyboard where there is a real one.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches || seed) inputRef.current?.focus({ preventScroll: true });
  }, [seed]);

  return (
    <div className="flex flex-col gap-3">
      {!q.trim() ? <Suggestions store={store} day={day} slot={slot} exclude={exclude} onPick={(s) => onChoose(s.name)} /> : null}
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" />
      <Input
        className="pl-9"
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          const pickName = top[0] ?? shown[0]?.name;
          if (e.key === "Enter" && pickName) {
            e.preventDefault();
            onChoose(pickName);
          }
        }}
        aria-label="Find a pharmacist"
        placeholder="Find someone else"
        autoComplete="off"
        enterKeyHint="done"
      />
      </div>
      {shown.length > 0 || q.trim() ? <p className="-mb-2 px-1 text-sm font-semibold text-ink">{q.trim() ? "Matches" : "Everyone else"}</p> : null}
      <ul className="max-h-[38dvh] overflow-y-auto overscroll-contain" aria-label="Everyone else, free first">
        {shown.length === 0 ? <li className="px-2 py-3 text-sm text-muted">No one matches “{q.trim()}”</li> : null}
        {shown.map((c) => {
          const tag = tagFor(c, storeTag);
          return (
            <li key={c.name} className="flex items-center gap-1">
              <button
                type="button"
                disabled={c.state === "blocked"}
                onClick={() => onChoose(c.name)}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-paper focus-visible:bg-paper focus-visible:outline-none",
                  c.here && "font-semibold",
                  c.state === "blocked" && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="truncate">{c.name}</span>
                    {c.home ? <RoleMark float={c.float} store={storeTag(c.home)} className="text-xs font-normal text-muted" /> : null}
                  </span>
                  {c.hints.length ? (
                    <span className="block truncate text-xs font-normal text-warn">
                      {c.hints.map((h) => h.text).join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-2 py-0.5 text-xs",
                    tag.tone === "plain" && "text-muted",
                    tag.tone === "here" && "bg-paper text-ink",
                    tag.tone === "off" && "bg-warn-bg text-warn",
                    tag.tone === "double" && "border border-dashed border-illegal text-illegal",
                    tag.tone === "blocked" && "border border-dotted border-illegal text-illegal",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {tag.icon ? <Mark icon={tag.icon} className="size-3.5" /> : null}
                    {tag.text}
                  </span>
                </span>
              </button>
              {phoneOf(doc, c.name) ? (
                <a
                  href={`tel:${phoneOf(doc, c.name).replace(/[^\d+]/g, "")}`}
                  aria-label={`Call ${c.name} at ${phoneOf(doc, c.name)}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink hover:bg-paper"
                >
                  <Mark icon="phone" className="size-4" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!q.trim() ? <NotOffered choices={choices} /> : null}
      <ReliefAdd onChoose={onChoose} />
    </div>
  );
}

/** A one-day relief or agency pharmacist who isn't on the roster. Added as a person who is only available that day. */
function ReliefAdd({ onChoose }: { onChoose: (name: string) => void }) {
  const sheet = useViewStore((s) => s.sheet)!;
  const doc = useScheduleStore((s) => s.doc);
  const addPerson = useScheduleStore((s) => s.addPerson);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const { store, day } = sheet;
  const storeRow = doc.stores.find((x) => x.code === store);
  const state = storeRow ? stateOfStore(storeRow) : "";
  const date = isoDate(doc.year, doc.month, day);
  function add() {
    const error = addPerson({
      name: name.trim(),
      role: "Pharmacist",
      home: store,
      lead: false,
      phone: "",
      color: "",
      licensedStates: state ? [state] : [],
      startsOn: date,
      endsOn: date,
    });
    if (error) {
      setErr(error);
      return;
    }
    announce(`${name.trim()} added for ${monthName(doc.year, doc.month).slice(0, 3)} ${day} only`);
    onChoose(name.trim());
  }
  return (
    <details className="px-1 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center underline">Relief pharmacist not on the list?</summary>
      <div className="flex flex-col gap-2 pb-2">
        <p className="text-xs text-muted text-pretty">
          Adds them for {monthName(doc.year, doc.month).slice(0, 3)} {day} only{state ? `, licensed in ${state}` : ""}. You can widen the dates on the People page.
        </p>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErr("");
            }}
            aria-label="Relief pharmacist name"
            maxLength={80}
            placeholder="Full name"
            autoComplete="off"
          />
          <Button type="button" variant="secondary" disabled={!name.trim()} onClick={add}>
            Add and schedule
          </Button>
        </div>
        {err ? <p className="text-xs font-medium text-illegal">{err}</p> : null}
      </div>
    </details>
  );
}

/**
 * Who can take an empty shift. A green-headed card of its own: free people first, each with a Schedule button, then a
 * search and everyone else. It is separate from the problem notice above it so it is clear these are the people available.
 */
export function CoverCard({ slot, seed, onChoose, title, exclude = [] }: { slot: SlotId; seed: string; onChoose: (name: string) => void; title?: string; exclude?: string[] }) {
  const sheet = useViewStore((s) => s.sheet)!;
  const doc = useScheduleStore((s) => s.doc);
  const { store, day } = sheet;
  const free = useMemo(() => rankCandidates(doc, store, day, slot).filter((x) => x.state === "free").length, [doc, store, day, slot]);
  return (
    <section aria-label="Who can cover" className="overflow-hidden rounded-xl bg-white ring-1 ring-ok/40">
      <header className="flex items-center gap-2 bg-ok-bg px-3 py-3">
        <UserCheck aria-hidden className="size-5 shrink-0 text-ok" />
        <h3 className="flex-1 text-base font-semibold">{title ?? (slot === "pharmacist2" ? "Second pharmacist" : "Available to cover")}</h3>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", free ? "bg-white text-ok" : "bg-illegal-bg text-illegal")}>{free ? `${free} free` : "none free"}</span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {free === 0 ? <p className="text-sm font-medium text-illegal">No one is free that day. People working elsewhere or on a usual day off are below.</p> : null}
        <Picker slot={slot} seed={seed} onChoose={onChoose} exclude={exclude} />
      </div>
    </section>
  );
}

export function phoneOf(doc: { people: { name: string; phone?: string }[] }, name: string): string {
  return doc.people.find((p) => p.name === name)?.phone?.trim() ?? "";
}
