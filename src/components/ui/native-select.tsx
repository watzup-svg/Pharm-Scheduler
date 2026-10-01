import * as React from "react";
import { cn } from "@/lib/utils";

/** `quiet` is the filled look of a secondary button, for filters and toolbars; the default white is for form fields. */
export function NativeSelect({ className, quiet = false, ...props }: React.ComponentProps<"select"> & { quiet?: boolean }) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md px-3 text-base text-ink sm:text-sm",
        quiet ? "bg-cream shadow-[0_0_0_1px_var(--color-edge),0_1px_2px_rgb(28_25_23/0.08)]" : "bg-cream shadow-[0_0_0_1px_var(--color-edge),inset_0_1px_2px_rgb(28_25_23/0.05)]",
        "transition-[box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-ink)]",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
