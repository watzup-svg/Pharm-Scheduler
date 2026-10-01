import { BrandBadge } from "@/components/brand-mark";
import { WEEKDAYS, employeeHeaderMeta, firstNames, parsePosterLine, stateFromAddress, type DistrictSheetModel, type EmployeeCalendarModel, type PrintModel, type StorePosterModel } from "@/lib/schedule/print-model";
import type { PrintPrefs } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

export function LetterSheet({
  model,
  draft = false,
  paper = "letter",
  grayscale = false,
  punch = false,
}: {
  model: PrintModel;
  draft?: boolean;
  paper?: PrintPrefs["paper"];
  grayscale?: boolean;
  punch?: boolean;
}) {
  return (
    <article
      className={cn(
        "letter-sheet relative flex flex-col bg-cream p-sheet text-ink shadow-[0_0_0_1px_var(--color-line),0_18px_40px_-24px_rgba(28,25,23,0.35)]",
        paper === "tabloid" ? "min-h-tabloid w-tabloid" : "min-h-letter w-letter",
        grayscale && "grayscale",
        punch && "pl-punch",
      )}
      aria-label="Letter preview"
    >
      {draft ? (
        <p aria-hidden data-mark="DRAFT" className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-7xl font-semibold text-illegal/25 after:content-[attr(data-mark)]" />
      ) : null}
      {model.kind === "store" ? (
        <StoreBody model={model} />
      ) : model.kind === "district" ? (
        <DistrictBody model={model} />
      ) : (
        <EmployeeBody model={model} />
      )}
    </article>
  );
}

export function TwoUpSheet({
  a,
  b,
  draft = false,
  grayscale = false,
  punch = false,
}: {
  a: EmployeeCalendarModel;
  b: EmployeeCalendarModel;
  draft?: boolean;
  grayscale?: boolean;
  punch?: boolean;
}) {
  return (
    <article
      className={cn(
        "letter-sheet relative flex min-h-letter w-letter flex-col bg-cream text-ink shadow-[0_0_0_1px_var(--color-line),0_18px_40px_-24px_rgba(28,25,23,0.35)]",
        grayscale && "grayscale",
        punch && "pl-punch",
      )}
      aria-label="Two-up letter preview"
    >
      {draft ? (
        <p aria-hidden data-mark="DRAFT" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center font-display text-7xl font-semibold text-illegal/25 after:content-[attr(data-mark)]" />
      ) : null}
      <div className="flex min-h-[5.4in] flex-col p-sheet pb-2">
        <EmployeeBody model={a} compact />
      </div>
      <div className="relative border-t border-dashed border-line">
        <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-cream px-2 text-[10px] tracking-wide text-muted">
          cut
        </span>
      </div>
      <div className="flex min-h-[5.4in] flex-col p-sheet pt-3">
        <EmployeeBody model={b} compact />
      </div>
    </article>
  );
}

function SheetHeader({
  kicker,
  title,
  meta,
  monthLabel,
}: {
  kicker: string;
  title: string;
  meta: string;
  monthLabel: string;
}) {
  return (
    <header className="mb-3 flex items-end justify-between gap-4 border-b border-line pb-3">
      <div aria-hidden className="absolute inset-x-0 top-0 h-2 bg-night">
        <div className="h-full w-[1.3in] bg-brand" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-ink">{kicker}</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-sm text-muted">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <p className="font-display text-base font-semibold text-ink">{monthLabel}</p>
        <BrandBadge className="h-11" />
      </div>
    </header>
  );
}

function WeekdayRow() {
  return (
    <div className="grid grid-cols-7 bg-night text-white">
      {WEEKDAYS.map((d) => (
        <div key={d} className="px-1 py-1.5 text-center text-xs font-semibold tracking-wide">
          {d.toUpperCase()}
        </div>
      ))}
    </div>
  );
}

function StoreBody({ model }: { model: StorePosterModel }) {
  return (
    <>
      <SheetHeader
        kicker={`STORE POSTER${stateFromAddress(model.address) ? ` · ${stateFromAddress(model.address)}` : ""}`}
        title={`${model.tag}  ${model.name}`}
        meta={`${model.address ? `${model.address} · ` : ""}${model.hours} · ${model.revised ? "Revised" : "Posted"} ${model.posted}`}
        monthLabel={model.monthLabel}
      />
      <WeekdayRow />
      <div className="grid flex-1 grid-cols-7">
        {model.weeks.flat().map((cell, i) => (
          <div
            key={i}
            className={cn(
              "min-h-24 border-b border-r border-line p-1.5",
              i % 7 === 0 && "border-l",
              cell.closed && "bg-shut text-muted",
            )}
          >
            {cell.day != null ? (
              <>
                <div className="text-xs font-semibold tabular-nums text-ink">{cell.day}</div>
                {cell.closed ? (
                  <div className="mt-5 text-center">
                    <p className="text-sm font-bold tracking-wide">CLOSED</p>
                    {cell.reason ? <p className="text-xs">{cell.reason}</p> : null}
                  </div>
                ) : (
                  <>
                    <ul className="mt-1 space-y-0.5">
                      {cell.lines.map((line, li) => (
                        <li
                          key={line}
                          className="text-sm leading-tight font-bold"
                          style={cell.nameColors[li] ? { color: cell.nameColors[li] } : undefined}
                        >
                          {(() => {
                            const p = parsePosterLine(line);
                            return (
                              <>
                                {p.second ? "2nd: " : ""}
                                {p.name}
                                {p.away ? <span className="block text-xs font-normal text-muted italic">from {p.away}</span> : null}
                              </>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                    {cell.note ? <p className="mt-1 text-xs italic text-muted">{cell.note}</p> : null}
                  </>
                )}
              </>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {model.clean ? "Names are pharmacists. CLOSED = the store is closed." : "Names are pharmacists. “from XXX” = their home store is XXX. CLOSED = the store is closed."}
      </p>
    </>
  );
}

function markClass(mark: string): string {
  if (mark === "DBL") return "text-illegal";
  if (mark === "PTO") return "text-warn";
  if (mark === "OFF") return "text-muted";
  return "text-ink";
}

function EmployeeBody({ model, compact = false }: { model: EmployeeCalendarModel; compact?: boolean }) {
  return (
    <>
      <SheetHeader
        kicker="EMPLOYEE MONTH"
        title={model.name}
        meta={employeeHeaderMeta(model)}
        monthLabel={model.monthLabel}
      />
      <WeekdayRow />
      <div className="grid flex-1 grid-cols-7">
        {model.weeks.flat().map((cell, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col border-b border-r border-line p-1.5",
              compact ? "min-h-14" : "min-h-24",
              i % 7 === 0 && "border-l",
            )}
          >
            {cell.day != null ? (
              <>
                <div className="text-xs font-semibold tabular-nums">{cell.day}</div>
                <p className={cn("flex flex-1 flex-col items-center justify-center font-semibold", compact ? "text-sm" : "text-lg", markClass(cell.mark))}>
                  {cell.mark}
                  {cell.cover ? <span className="text-[10px] font-normal text-muted">cover</span> : null}
                </p>
              </>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        {model.clean ? "Store: where they work. A blank day is not scheduled." : "Store: where they work. cover: not their home store. OFF: not scheduled. PTO: time off. DBL: scheduled twice that day."}
      </p>
    </>
  );
}

function DistrictBody({ model }: { model: DistrictSheetModel }) {
  const days = model.stores[0]?.days ?? [];
  return (
    <>
      <SheetHeader
        kicker="DISTRICT"
        title="Pharmacists"
        meta={model.clean ? `Posted ${model.posted}` : `Posted ${model.posted}${model.holes.length ? ` · ${model.holes.length} ${model.holes.length === 1 ? "day" : "days"} with no coverage` : " · covered"}`}
        monthLabel={model.monthLabel}
      />
      <div className="overflow-auto" tabIndex={0} role="region" aria-label="Calendar table">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-night text-white">
              <th className="px-1 py-1 text-left">Store</th>
              {days.map((d) => (
                <th key={d.day} className="px-0.5 py-1 font-semibold tabular-nums">
                  {d.day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.stores.map((store) => (
              <tr key={store.code} className="border-b border-line">
                <td className="px-1 py-1 font-semibold">{store.tag}</td>
                {store.days.map((cell) => (
                  <td
                    key={cell.day}
                    className={cn(
                      "px-0.5 py-1 text-center",
                      cell.closed && "bg-shut text-muted",
                      !cell.closed && !cell.names.length && !model.clean && "bg-illegal-bg text-illegal",
                    )}
                  >
                    {cell.closed ? (
                      "X"
                    ) : firstNames(cell.names).length ? (
                      <span className="flex flex-col leading-tight">
                        {firstNames(cell.names).map((name, i) => (
                          <span key={`${cell.day}-${i}`}>{name}</span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {model.exceptions.length ? (
        <p className="mt-3 text-xs text-ink">Left as is and planned: {model.exceptions.join(" · ")}</p>
      ) : null}
      {model.holes.length ? (
        <p className="mt-3 text-xs text-illegal">
          No coverage: {model.holes.map((h) => `${h.tag} ${h.day}`).join(" · ")}
        </p>
      ) : model.clean ? null : (
        <p className="mt-3 text-xs text-muted">Every open day has a pharmacist.</p>
      )}
    </>
  );
}
