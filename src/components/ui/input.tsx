import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md bg-cream px-3 text-base text-ink sm:text-sm shadow-[0_0_0_1px_var(--color-edge),inset_0_1px_2px_rgb(28_25_23/0.05)] placeholder:text-muted",
        "transition-[box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-ink)]",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
