"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import type { DealStage } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { removeDealFromCycleAction } from "../actions";

/**
 * Past / non-primary deals for a company. Each entry can be removed from its
 * cycle (hard-deletes that deal).
 */
export function OtherCycles({
  companyId,
  deals,
  primaryId,
}: {
  companyId: number;
  deals: { id: number; cycle: string; stage: string }[];
  primaryId?: number;
}) {
  const others = deals.filter((d) => d.id !== primaryId);
  if (others.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Other cycles</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {others.map((d) => (
          <OtherCycleRow key={d.id} companyId={companyId} deal={d} />
        ))}
      </CardContent>
    </Card>
  );
}

function OtherCycleRow({
  companyId,
  deal,
}: {
  companyId: number;
  deal: { id: number; cycle: string; stage: string };
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (pending) return;
    if (
      !window.confirm(
        `Remove this company from the ${deal.cycle} cycle? This deletes the ${deal.stage} deal.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("companyId", String(companyId));
    fd.set("dealId", String(deal.id));
    startTransition(() => removeDealFromCycleAction(fd));
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{deal.cycle}</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{stageLabel(deal.stage)}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={remove}
          aria-label={`Remove from ${deal.cycle}`}
          title={`Remove from ${deal.cycle}`}
          className="size-7 p-0 text-muted-foreground hover:text-destructive"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function stageLabel(stage: string): string {
  const s = stage as DealStage;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
