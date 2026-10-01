import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[opacity,transform,background-color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-cream shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(28_25_23/0.35)] hover:bg-night active:shadow-[inset_0_1px_3px_rgb(0_0_0/0.45)]",
        secondary: "bg-cream text-ink ring-1 ring-edge shadow-[0_1px_2px_rgb(28_25_23/0.08)] hover:bg-paper active:bg-fill",
        ghost: "text-ink hover:bg-ink/5 active:bg-ink/10",
        // On the dark page headers.
        light: "bg-cream text-ink shadow-[0_1px_2px_rgb(0_0_0/0.3)] hover:bg-white",
        lightGhost: "text-white ring-1 ring-white/40 hover:bg-white/10",
        // Anything about someone being off (sick, vacation, time off): the same yellow as the time-off marks.
        away: "bg-warn-bg text-warn ring-1 ring-warn/40 shadow-[0_1px_2px_rgb(122_78_8/0.15)] hover:bg-[#efd987] active:bg-[#e8cd6e]",
        danger: "bg-illegal-bg text-illegal ring-1 ring-illegal/40 hover:bg-illegal/15",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-11 px-3 text-sm",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
