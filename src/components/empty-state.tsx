import { EmptyArt } from "@/components/graphics";
import { cn } from "@/lib/utils";

/** One shape for "nothing here": a small drawing, what this is, why it's empty, and what to do next. */
export function EmptyState({
  kind,
  title,
  hint,
  className,
  children,
}: {
  kind: Parameters<typeof EmptyArt>[0]["kind"];
  title: string;
  hint?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("surface px-5 py-8 text-center", className)}>
      <EmptyArt kind={kind} />
      <p className="mt-2 font-semibold">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-sm text-pretty text-muted">{hint}</p> : null}
      {children ? <div className="mt-3 flex justify-center gap-2">{children}</div> : null}
    </div>
  );
}
