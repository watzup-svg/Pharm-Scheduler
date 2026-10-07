// The Time off header picture: where every request stands, as three bars. Not a calendar (the month below is the only one).
import { cx } from "../../ui/primitives.tsx";

export function Standing({ waiting, approved, declined }: { waiting: number; approved: number; declined: number }) {
  const max = Math.max(1, waiting, approved, declined);
  const rows: [string, number, string][] = [
    ["To approve", waiting, "bg-warn-bg"],
    ["Approved", approved, "bg-ok-lite"],
    ["Declined", declined, "bg-white/40"],
  ];
  return (
    <div role="group" aria-label={`To approve ${waiting}, approved ${approved}, declined ${declined}`} data-standing className="flex w-[230px] flex-col justify-center gap-2.5" data-tip="Time off by decision | From today on | To approve, approved, declined">
      {rows.map(([label, n, tone]) => (
        <div key={label} className="grid grid-cols-[76px_1fr_24px] items-center gap-2 text-xs leading-none text-cream/80">
          <span>{label}</span>
          <span aria-hidden className="h-2 rounded-full bg-white/10"><span className={cx("block h-full rounded-full", tone)} style={{ width: `${n ? Math.max(8, (n / max) * 100) : 0}%` }} /></span>
          <span className="text-right text-sm font-semibold tabular-nums text-cream">{n}</span>
        </div>
      ))}
    </div>
  );
}
