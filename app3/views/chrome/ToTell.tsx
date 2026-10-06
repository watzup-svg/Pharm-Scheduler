// To tell: who has a changed schedule they have not heard about yet.
import { useMemo, useState } from "react";
import { api, type ToTellEntry } from "@domain";
import { useApp } from "../../store.ts";
import { Btn } from "../../ui/primitives.tsx";
import { fmtDate, firstName, placeWords } from "./shared.tsx";

type Group = { pharmacistId: string; name: string; entries: ToTellEntry[] };

export function ToTell() {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const [fallback, setFallback] = useState<{ title: string; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const state = world.state;
  const groups = useMemo<Group[]>(() => {
    const out = new Map<string, Group>();
    for (const e of api.toTell(world, asOf)) {
      const g = out.get(e.pharmacistId) ?? { pharmacistId: e.pharmacistId, name: state.pharmacists[e.pharmacistId]?.name ?? e.pharmacistId, entries: [] };
      g.entries.push(e);
      out.set(e.pharmacistId, g);
    }
    return [...out.values()];
  }, [world, asOf, state]);

  const line = (e: ToTellEntry) => `${fmtDate(e.date)}: was ${placeWords(state, e.was)}, now ${placeWords(state, e.now)}`;
  const message = (g: Group) => {
    const parts = g.entries.map((e) => (e.now === "off" ? `off ${fmtDate(e.date)}` : `at ${placeWords(state, e.now)} ${fmtDate(e.date)}`));
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
    return `Hi ${firstName(g.name)}, you're ${joined}.`;
  };
  const copy = async (title: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      setCopied(title);
    } catch {
      setCopied(null);
      setFallback({ title, text });
    }
  };
  const mark = (entries: ToTellEntry[]) => {
    useApp.getState().markTold(entries.map((e) => ({ pharmacistId: e.pharmacistId, date: e.date })));
    setFallback(null);
    setCopied(null);
  };

  if (!groups.length) return <p className="px-3 py-3 text-sm">Everyone has been told.</p>;
  const all = groups.flatMap((g) => g.entries);
  return (
    <div className="px-3 py-2.5">
      <p className="text-xs text-muted">Changes since you last told each person, from {fmtDate(asOf)} on.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Btn onClick={() => copy("everyone", groups.map(message).join("\n"))}>Copy all messages</Btn>
        <Btn onClick={() => mark(all)}>Mark all told</Btn>
      </div>
      {copied && <p className="mt-1.5 text-xs" role="status">✓ Copied the message for {copied}.</p>}
      {fallback && (
        <div className="mt-2">
          <label htmlFor="tell-fallback" className="text-xs font-medium">Copying did not work. Select this text and copy it ({fallback.title}).</label>
          <textarea id="tell-fallback" readOnly rows={Math.min(8, fallback.text.split("\n").length + 1)} value={fallback.text} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full rounded-md border border-edge bg-white p-1.5 text-sm" />
        </div>
      )}
      <ul className="mt-3 space-y-3">
        {groups.map((g) => (
          <li key={g.pharmacistId} className="rounded-md bg-white p-2 ring-1 ring-line" aria-label={`To tell: ${g.name}`}>
            <h3 className="text-sm font-semibold">{g.name}</h3>
            <ul className="mt-1 space-y-0.5 text-sm">
              {g.entries.map((e) => (
                <li key={e.date}>{line(e)}</li>
              ))}
            </ul>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Btn aria-label={`Copy message: ${g.name}`} onClick={() => copy(g.name, message(g))}>Copy message</Btn>
              <Btn aria-label={`Mark told: ${g.name}`} onClick={() => mark(g.entries)}>Mark told</Btn>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
