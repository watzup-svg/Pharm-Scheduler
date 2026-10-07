// The frame every full-page screen sits in (Overview, Print, Setup), so they share margins, width and rhythm. The grids (Schedule, Plan ahead, Time off) run full width instead.
import type { ReactNode } from "react";
import { cx } from "./primitives.tsx";

const WIDTH = { wide: "max-w-[1200px]", narrow: "max-w-[860px]" } as const;

export function PageFrame({ width = "wide", children, className, ...rest }: { width?: keyof typeof WIDTH; children: ReactNode; className?: string } & Record<`data-${string}`, string | undefined>) {
  return <div {...rest} className={cx("mx-auto flex w-full flex-col gap-5 px-6 py-5", WIDTH[width], className)}>{children}</div>;
}

/** The small uppercase title every section of a full-page screen starts with. */
export function SectionTitle({ id, children, right }: { id?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <h2 id={id} className="text-xs font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
  );
}
