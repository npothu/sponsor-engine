import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Packet-style page header: Fraunces display title with the diamond-capped
 * rule from the sponsorship-packet look, optional subtitle and actions slot.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="font-display text-[1.7rem] font-bold leading-tight text-primary dark:text-foreground">
            {title}
          </h1>
          <div className="diamond-rule mt-2" aria-hidden>
            <span />
          </div>
          {subtitle ? (
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Smaller section heading with the same serif voice, for card groups and
 * page sections.
 */
export function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-display text-lg font-semibold text-primary dark:text-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}
