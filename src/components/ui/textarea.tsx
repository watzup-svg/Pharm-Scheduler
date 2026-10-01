import * as React from "react";
import { cn } from "@/lib/utils";

/** The same field look as Input, for longer text. */
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md bg-cream p-3 text-sm text-ink ring-1 ring-line placeholder:text-muted",
        "transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none",
        "disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
