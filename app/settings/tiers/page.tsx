import { listTiers, listAddons, listDeliverableTemplates } from "@/lib/data";
import type { DeliverableTemplate, Tier } from "@/lib/schema";
import { listDealsByTargetTier } from "./data";
import { TierCard } from "./tier-card";
import { TierCreateForm } from "./tier-create-form";
import { AddonRow } from "./addon-row";
import { AddonCreateForm } from "./addon-create-form";
import { TierComparison } from "@/components/tier-comparison";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const UNLABELED = "Unlabeled tiers";

function groupByPackage(tiers: Tier[]): Map<string, Tier[]> {
  const groups = new Map<string, Tier[]>();
  for (const tier of tiers) {
    const key = tier.packageLabel ?? UNLABELED;
    const list = groups.get(key) ?? [];
    list.push(tier);
    groups.set(key, list);
  }
  return groups;
}

export default async function TiersSettingsPage() {
  const allTiers = await listTiers();
  const addons = await listAddons();
  const dealsByTier = await listDealsByTargetTier();

  const benefitsByTier = new Map<number, DeliverableTemplate[]>();
  for (const dt of await listDeliverableTemplates()) {
    const list = benefitsByTier.get(dt.tierId) ?? [];
    list.push(dt);
    benefitsByTier.set(dt.tierId, list);
  }

  // Sponsor-facing comparison: active tiers ascending by price, anchor = the
  // top-priced active tier (matches the revenue view's anchor definition).
  const comparisonTiers = allTiers
    .filter((t) => t.active)
    .sort((a, b) => a.price - b.price || a.position - b.position);
  const anchorTierId =
    comparisonTiers.length > 0
      ? comparisonTiers.reduce((top, t) => (t.price > top.price ? t : top))
          .id
      : null;

  const groups = groupByPackage(allTiers);

  // Active working set = any group containing at least one active tier;
  // shown expanded and first. Legacy/inactive groups are collapsed.
  const activeGroups: [string, Tier[]][] = [];
  const legacyGroups: [string, Tier[]][] = [];
  for (const entry of groups) {
    const [, groupTiers] = entry;
    if (groupTiers.some((t) => t.active)) {
      activeGroups.push(entry);
    } else {
      legacyGroups.push(entry);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tiers"
        subtitle="Edit sponsorship tiers, pricing, and packages, plus a la carte add-ons."
      />

      <div className="space-y-7">
        {comparisonTiers.length > 0 && (
          <section className="space-y-3.5">
            <SectionHeading>Sponsor-facing comparison</SectionHeading>
            <p className="text-sm text-muted-foreground">
              Side-by-side view of what each active tier includes, drawn from the
              deliverable checklist. Print this page to share it as a one-page
              packet.
            </p>
            <TierComparison
              tiers={comparisonTiers}
              benefitsByTier={benefitsByTier}
              addons={addons}
              anchorTierId={anchorTierId}
            />
          </section>
        )}

        <section className="space-y-3.5">
          <div className="flex items-center justify-between gap-4">
            <SectionHeading>Active working set</SectionHeading>
            <TierCreateForm
              defaultPackageLabel={activeGroups[0]?.[0] ?? undefined}
            />
          </div>

          {activeGroups.length === 0 && (
            <Card className="border-dashed items-center px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No active tiers yet. Create one to start building the working
                set.
              </p>
            </Card>
          )}

          {activeGroups.map(([label, groupTiers]) => (
            <div key={label} className="space-y-2.5">
              <h2 className="text-sm font-semibold text-foreground">{label}</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
                {groupTiers.map((tier) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    benefits={benefitsByTier.get(tier.id) ?? []}
                    targetingDeals={dealsByTier.get(tier.id) ?? []}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        {legacyGroups.length > 0 && (
          <section className="space-y-3.5 border-t pt-6">
            <SectionHeading>Legacy / published sets</SectionHeading>
            {legacyGroups.map(([label, groupTiers]) => (
              <details
                key={label}
                className="group rounded-xl border bg-muted px-4 py-1 [&[open]]:pb-4"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2.5 py-3 text-sm font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="text-muted-foreground transition-transform group-open:rotate-90">
                    &#9656;
                  </span>
                  {label}
                  <Badge variant="secondary">
                    {groupTiers.length} tier{groupTiers.length === 1 ? "" : "s"}
                  </Badge>
                </summary>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
                  {groupTiers.map((tier) => (
                    <TierCard
                      key={tier.id}
                      tier={tier}
                      benefits={benefitsByTier.get(tier.id) ?? []}
                      targetingDeals={dealsByTier.get(tier.id) ?? []}
                    />
                  ))}
                </div>
              </details>
            ))}
          </section>
        )}

        <section className="space-y-3.5 border-t pt-6">
          <div className="flex items-center justify-between gap-4">
            <SectionHeading>A la carte add-ons</SectionHeading>
            <AddonCreateForm />
          </div>

          {addons.length === 0 ? (
            <Card className="border-dashed items-center px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No add-ons yet. Add-ons attach to deals independent of tier -
                create one to offer it.
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {addons.map((addon) => (
                <AddonRow key={addon.id} addon={addon} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
