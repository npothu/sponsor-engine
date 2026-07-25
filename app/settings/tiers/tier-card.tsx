"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { DeliverableTemplate, Tier } from "@/lib/schema";
import type { DealTargetingTier } from "./data";
import { updateTierAction, toggleTierActiveAction } from "./actions";
import { Card } from "@/components/ui/card";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { VariantProps } from "class-variance-authority";

interface TierCardProps {
  tier: Tier;
  /** Canonical benefit list for this tier, the single source of truth shared
   *  with fulfillment. Rendered as the tier's bullets when present. */
  benefits: DeliverableTemplate[];
  targetingDeals: DealTargetingTier[];
}

/** Maps a tier name to the packet's silver/gold/platinum badge variant, if it matches. */
function tierBadgeVariant(name: string): VariantProps<typeof badgeVariants>["variant"] | null {
  const key = name.trim().toLowerCase();
  if (key === "silver") return "silver";
  if (key === "gold") return "gold";
  if (key === "platinum") return "platinum";
  return null;
}

export function TierCard({ tier, benefits, targetingDeals }: TierCardProps) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleToggleActive() {
    startTransition(() => toggleTierActiveAction(tier.id, !tier.active));
  }

  if (editing) {
    return (
      <Card className="px-5">
        <form
          className="flex flex-col gap-4"
          action={async (form) => {
            await updateTierAction(tier.id, form);
            setEditing(false);
          }}
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            <div>
              <Label htmlFor={`name-${tier.id}`}>Name</Label>
              <Input id={`name-${tier.id}`} name="name" defaultValue={tier.name} required />
            </div>
            <div>
              <Label htmlFor={`price-${tier.id}`}>Price ($)</Label>
              <Input
                id={`price-${tier.id}`}
                name="price"
                type="number"
                min={0}
                step={1}
                defaultValue={tier.price}
                required
              />
            </div>
            <div>
              <Label htmlFor={`position-${tier.id}`}>Position</Label>
              <Input
                id={`position-${tier.id}`}
                name="position"
                type="number"
                step={1}
                defaultValue={tier.position}
              />
            </div>
            <div>
              <Label htmlFor={`package-${tier.id}`}>Package label</Label>
              <Input
                id={`package-${tier.id}`}
                name="packageLabel"
                defaultValue={tier.packageLabel ?? ""}
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`description-${tier.id}`}>Description</Label>
            <Textarea
              id={`description-${tier.id}`}
              name="description"
              defaultValue={tier.description ?? ""}
              rows={2}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  const tierVariant = tierBadgeVariant(tier.name);

  return (
    <Card className="px-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-semibold text-foreground">
              {tier.name}
            </span>
            {tierVariant && <Badge variant={tierVariant}>{tier.name}</Badge>}
          </div>
          <div className="mt-1.5 font-display text-2xl font-bold text-primary dark:text-foreground">
            ${tier.price.toLocaleString()}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge variant="secondary">position {tier.position}</Badge>
          {tier.packageLabel && <Badge variant="secondary">{tier.packageLabel}</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {tier.active ? (
          <Badge variant="solid">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
      </div>

      {benefits.length > 0 ? (
        <ul className="space-y-1.5">
          {benefits.map((b) => (
            <li
              key={b.id}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <Check className="mt-0.5 size-3.5 shrink-0 text-lime" aria-hidden />
              <span>{b.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        tier.description && (
          <ul className="space-y-1.5">
            {tier.description
              .split(/(?<=[.;])\s+/)
              .map((s) => s.trim())
              .filter(Boolean)
              .map((sentence, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-lime" aria-hidden />
                  <span>{sentence}</span>
                </li>
              ))}
          </ul>
        )
      )}

      {benefits.length > 0 && tier.description && (
        <p className="text-xs italic text-muted-foreground">
          {tier.description}
        </p>
      )}

      <Separator />

      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {targetingDeals.length} deal{targetingDeals.length === 1 ? "" : "s"} targeting this tier
        </span>
        {targetingDeals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {targetingDeals.map((d) => (
              <Link key={d.dealId} href={`/companies/${d.companyId}`}>
                <Badge variant="outline" className="gap-1.5 hover:border-primary/40 hover:text-foreground">
                  {d.companyName}
                  <span className="text-muted-foreground">&middot; {d.cycle}</span>
                </Badge>
              </Link>
            ))}
          </div>
        )}
        <p className="text-xs italic text-muted-foreground">
          Editing this tier does not rewrite terms on existing deals - each
          deal keeps its own custom terms.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={handleToggleActive}
        >
          {tier.active ? "Deactivate" : "Activate"}
        </Button>
      </div>
    </Card>
  );
}
