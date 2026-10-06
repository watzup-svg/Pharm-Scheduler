// A screen title with an optional "?" that carries the longer explanation as a hover note ("Title | line | line").
export function TipButton({ title, tip }: { title: string; tip: string }) {
  return (
    <button type="button" aria-label={`About ${title.toLowerCase()}`} data-tip={`${title} | ${tip}`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fill text-xs font-semibold text-muted ring-1 ring-inset ring-edge hover:bg-line focus-visible:outline-2 focus-visible:outline-ink">
      ?
    </button>
  );
}

export function Title({ children, tip, as: H = "h2", className = "text-lg font-semibold", id }: { children: string; tip?: string; as?: "h2" | "h3"; className?: string; id?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <H id={id} className={className}>{children}</H>
      {tip && <TipButton title={children} tip={tip} />}
    </div>
  );
}

/** One short line with a "?" after it for the rest. */
export function Hint({ title, line, tip }: { title: string; line: string; tip: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted">
      <span>{line}</span>
      <TipButton title={title} tip={tip} />
    </div>
  );
}
