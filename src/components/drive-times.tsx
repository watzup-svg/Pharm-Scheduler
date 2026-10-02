import { useMemo, useState } from "react";
import { announce } from "@/components/undo";
import { useStoreTag } from "@/components/use-store-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { driveBetween, pairMiles } from "@/lib/schedule/geo";
import { paidMilesFor, freeMilesOf, rateOf, FEDERAL_RATE } from "@/lib/schedule/mileage";
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
  const [miles, setMiles] = useState("");
  const [rate, setRate] = useState("");
  const setMilesFor = useScheduleStore((s) => s.setDriveMiles);
  const setRateOf = useScheduleStore((s) => s.setMileageRate);
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
  const pairM = from && to && from !== to ? pairMiles(doc, from, to) : null;
  const free = freeMilesOf(doc);
  const missing = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < doc.stores.length; i++)
      for (let j = i + 1; j < doc.stores.length; j++) if (pairMiles(doc, doc.stores[i]!.code, doc.stores[j]!.code).source === "missing") out.push(`${doc.stores[i]!.code} ↔ ${doc.stores[j]!.code}`);
    return out;
  }, [doc]);
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
        {pairM ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{pairM.miles == null ? "Miles unknown" : `${pairM.miles} mi one way`}</span>
              <span className="text-muted">
                {pairM.source === "set" ? " · set by you" : pairM.source === "estimated" ? " · an estimate from the store locations" : " · no location, so no estimate"}
                {pairM.miles != null && pairM.miles > free ? ` · ${paidMilesFor(pairM.miles, free)} paid mi a day if worked away from home` : ""}
              </span>
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dt-miles">Miles</Label>
              <Input id="dt-miles" inputMode="decimal" className="w-28" value={miles} placeholder={pairM.miles != null ? String(pairM.miles) : ""} onChange={(e) => setMiles(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!(Number(miles) >= 0.1)}
              onClick={() => {
                setMilesFor(from, to, Number(miles));
                announce(`${tag(from)} to ${tag(to)} set to ${miles} miles`);
                setMiles("");
              }}
            >
              Set miles
            </Button>
            {pairM.source === "set" && from !== to && doc.driveMiles?.[[from, to].sort().join("|")] != null ? (
              <Button type="button" variant="ghost" onClick={() => setMilesFor(from, to, null)}>
                Use the estimate
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
          <p className="min-w-0 flex-1 text-sm text-muted">
            Mileage pay: working away from the home store, every mile past {free} one way is paid, both ways, at the rate below.{" "}
            {doc.mileage?.rate != null
              ? "This is a rate you set. "
              : `Using the ${FEDERAL_RATE.year} IRS standard business rate (effective ${FEDERAL_RATE.effective}, last checked ${FEDERAL_RATE.checked}). `}
            The IRS changes it every year: check it each January at{" "}
            <a className="underline" href={FEDERAL_RATE.source} target="_blank" rel="noopener noreferrer">irs.gov</a>.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mi-rate">Rate per mile ($)</Label>
            <Input id="mi-rate" inputMode="decimal" className="w-28" value={rate} placeholder={rateOf(doc).toFixed(3).replace(/0$/, "")} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={rate === "" || !Number.isFinite(Number(rate))}
            onClick={() => {
              setRateOf(Number(rate));
              announce(`Mileage rate set to $${Number(rate)} a mile`);
              setRate("");
            }}
          >
            Set rate
          </Button>
          {doc.mileage?.rate != null ? (
            <Button type="button" variant="ghost" onClick={() => setRateOf(null)}>
              Use the IRS rate
            </Button>
          ) : null}
        </div>
        {missing.length ? (
          <p className="text-sm text-muted" role="status">
            No distance known for {missing.length} pair{missing.length === 1 ? "" : "s"} ({missing.slice(0, 6).join(", ")}
            {missing.length > 6 ? ", …" : ""}). Mileage for those shows as unknown, never as zero. Set miles above, or add the store locations.
          </p>
        ) : null}
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
