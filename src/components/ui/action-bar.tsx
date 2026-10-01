import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A row of actions that never squeezes text. Children share the row when they fit and wrap onto the next line when they
 * don't, each keeping a readable minimum width. Use this instead of a hand-rolled flex row next to a name or a sentence.
 */
export function ActionBar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap gap-2 [&>*]:min-w-[8.5rem] [&>*]:flex-1", className)} {...props} />;
}
