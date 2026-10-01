import { useMemo, useState } from "react";
import { announce } from "@/components/undo";
import { useStoreTag } from "@/components/use-store-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { driveBetween } from "@/lib/schedule/geo";
import { driveLabel, driveText } from "@/lib/schedule/suggest";
import { useScheduleStore } from "@/store/schedule-store";

/**
 * Suggestions rank people by drive time. The numbers come from the addresses (a straight line, stretched),
 * so they can be wrong for a river or a mountain pass. Here she can correct any pair, and see what is nearest.
 */
export function DriveTimes() {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const setDrive = useScheduleStore((s) => s.setDriveMinutes);
  const [from, setFrom] = useState(doc.stores[0]?.code ?? "");
  const [to, setTo] = useState(doc.stores[1]?.code ?? "");
  const [minutes, setMinutes] = useState("");
  const pair = from && to && from !== to ? driveBetween(doc, from, to) : null;
  const nearest = useMemo(
    () =>
      doc.stores
        .filter((s) => s.code !== from)
        .map((s) => ({ s, d: driveBetween(doc, from, s.code) }))
        .filter((x): x is { s: typeof x.s; d: NonNullable<typeof x.d> } => x.d != null)
        .sort((a, b) => a.d.minutes - b.d.minutes)
        .slice(0, 3),
    [doc, from],
  );
  const hand = Object.entries(doc.driveMinutes ?? {});
  const name = (code: string) => doc.stores.find((s) => s.code === code)?.name ?? code;

  if (doc.stores.length < 2) return null;
  return (
    <details className="surface">
      <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-semibold">Drive times between stores</summary>
      <div className="flex flex-col gap-4 px-5 pb-5">
        <p className="text-sm text-pretty text-muted">
          Suggestions prefer people with the shortest drive. Times marked “~” are estimates from the addresses. Set your own where the estimate is wrong; yours replaces it everywhere.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dt-from">From</Label>
            <NativeSelect id="dt-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {doc.stores.map((s) => (
                <option key={s.code} value={s.code}>
                  {tag(s.code)} · {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dt-to">To</Label>
            <NativeSelect id="dt-to" value={to} onChange={(e) => setTo(e.target.value)}>
              {doc.stores.map((s) => (
                <option key={s.code} value={s.code}>
                  {tag(s.code)} · {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {pair ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{driveLabel(pair.minutes, pair.estimated)}</span>
              <span className="text-muted">{pair.estimated ? " · estimated from the addresses" : " · set by you"}</span>
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dt-min">Minutes</Label>
              <Input id="dt-min" inputMode="numeric" className="w-28" value={minutes} placeholder={String(pair.minutes)} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!minutes || Number(minutes) < 1}
              onClick={() => {
                setDrive(from, to, Number(minutes));
                announce(`${tag(from)} to ${tag(to)} set to ${driveText(Number(minutes))}`);
                setMinutes("");
              }}
            >
              Set
            </Button>
            {!pair.estimated ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDrive(from, to, null);
                  announce(`${tag(from)} to ${tag(to)} back to the estimate`);
                }}
              >
                Use the estimate
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">{from === to ? "Choose two different stores." : "One of these has no location, so there is no estimate. Set a time to use one."}</p>
        )}
        {nearest.length ? (
          <p className="text-sm text-muted">
            Nearest to {tag(from)}: {nearest.map((x) => `${tag(x.s.code)} ${driveLabel(x.d.minutes, x.d.estimated)}`).join(" · ")}
          </p>
        ) : null}
        {hand.length ? (
          <ul className="flex flex-col gap-1 text-sm" aria-label="Times you set">
            {hand.map(([key, min]) => {
              const [a, b] = key.split("|") as [string, string];
              return (
                <li key={key} className="flex items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2">
                  <span className="min-w-0 truncate">
                    {name(a)} ↔ {name(b)}: <span className="font-semibold">{driveText(min)}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDrive(a, b, null)}>
                    Clear
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
