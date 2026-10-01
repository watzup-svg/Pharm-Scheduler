import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "plain",
  ...props
}: React.ComponentProps<"span"> & { tone?: "plain" | "ok" | "fix" | "warn" | "illegal" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold tabular-nums",
        tone === "plain" && "bg-paper text-ink",
        tone === "ok" && "bg-ink text-cream",
        tone === "fix" && "bg-illegal text-cream",
        tone === "warn" && "bg-warn-bg text-warn",
        tone === "illegal" && "bg-illegal-bg text-illegal",
        className,
      )}
      {...props}
    />
  );
}
