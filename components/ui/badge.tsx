import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/12 text-primary dark:bg-primary/15 dark:text-lime",
        solid: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-muted-foreground",
        destructive:
          "border-transparent bg-destructive/12 text-destructive dark:bg-destructive/18 dark:text-[#f0a08e]",
        lime: "border-transparent bg-lime/18 text-[#4d7422] dark:bg-lime/15 dark:text-lime",
        info: "border-transparent bg-info/12 text-info dark:bg-info/18 dark:text-[#8fc1f2]",
        warning:
          "border-transparent bg-[#f3e3b8]/70 text-[#8a6a1d] dark:bg-[#46391a] dark:text-[#e5c877]",
        silver:
          "border-transparent bg-(--tier-silver-bg) text-(--tier-silver-fg) uppercase tracking-wide",
        gold: "border-transparent bg-(--tier-gold-bg) text-(--tier-gold-fg) uppercase tracking-wide",
        platinum:
          "border-transparent bg-(--tier-platinum-bg) text-(--tier-platinum-fg) uppercase tracking-wide",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
