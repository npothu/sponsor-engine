"use client";

import Link from "next/link";
import { useTransition } from "react";
import { generateDeliverablesAction } from "../actions";
import { Button } from "@/components/ui/button";

interface GenerateButtonProps {
  dealId: number;
  companyId: number;
  tierName: string | null;
  hasTemplates: boolean;
}

/**
 * Prominent entry point shown when a deal has zero deliverables. With a tier +
 * templates, generates the checklist. With a tier but no templates, points at
 * the template editor. With NO tier, it can never generate anything, so it
 * explicitly prompts to assign a tier (linking to the deal panel) rather than
 * showing a Generate button that silently does nothing.
 */
export function GenerateButton({
  dealId,
  companyId,
  tierName,
  hasTemplates,
}: GenerateButtonProps) {
  const [pending, startTransition] = useTransition();

  if (!tierName) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-muted px-4 py-3.5">
        <p className="text-sm text-muted-foreground">
          No target tier is set on this deal, so there is no checklist to
          generate. Assign a tier to generate its deliverables, or add custom
          deliverables below.
        </p>
        <Button type="button" size="sm" variant="outline" asChild>
          <Link href={`/companies/${companyId}#deals`}>Assign a tier</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border bg-muted px-4 py-3.5">
      <p className="text-sm text-muted-foreground">
        {hasTemplates
          ? `No deliverables yet. Generate the ${tierName} checklist to get started.`
          : `No deliverables yet. The ${tierName} tier has no templates - add a custom deliverable below, or define templates at the bottom of this page.`}
      </p>
      {hasTemplates && (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(() => generateDeliverablesAction(dealId))
          }
        >
          {pending ? "Generating..." : `Generate from ${tierName}`}
        </Button>
      )}
    </div>
  );
}

export default GenerateButton;
