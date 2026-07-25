import { Check } from "lucide-react";
import type { Addon, DeliverableTemplate, Tier } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";

/** Normalized key for matching a benefit title across tiers. */
function benefitKey(title: string): string {
  return title.trim().toLowerCase();
}

interface TierComparisonProps {
  /** Active tiers, ascending by price (columns, left to right). */
  tiers: Tier[];
  /** Canonical benefit list per tier id (the deliverable templates). */
  benefitsByTier: Map<number, DeliverableTemplate[]>;
  /** A la carte add-ons, shown below the matrix. */
  addons: Addon[];
  /** The anchor (top-priced active) tier - its column is highlighted. */
  anchorTierId: number | null;
}

/**
 * Read-only, printable side-by-side benefit matrix across the active tiers -
 * the classic sponsorship-packet comparison layout. Rows are the union of every
 * tier's deliverable-template benefits (the single source of truth), columns are
 * the tiers with price, and a check marks which tier includes each benefit. The
 * anchor tier column is visually emphasized to steer prospects toward it.
 */
export function TierComparison({
  tiers,
  benefitsByTier,
  addons,
  anchorTierId,
}: TierComparisonProps) {
  if (tiers.length === 0) return null;

  // Union of benefit titles, in first-seen order across the ascending tiers so
  // shared lower-tier benefits sort to the top.
  const rowTitles: string[] = [];
  const seen = new Set<string>();
  for (const tier of tiers) {
    for (const b of benefitsByTier.get(tier.id) ?? []) {
      const key = benefitKey(b.title);
      if (seen.has(key)) continue;
      seen.add(key);
      rowTitles.push(b.title);
    }
  }

  const tierHasBenefit = (tierId: number, title: string): boolean =>
    (benefitsByTier.get(tierId) ?? []).some(
      (b) => benefitKey(b.title) === benefitKey(title),
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-muted px-4 py-3 text-left align-bottom text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Benefit
            </th>
            {tiers.map((tier) => {
              const isAnchor = tier.id === anchorTierId;
              return (
                <th
                  key={tier.id}
                  className={
                    isAnchor
                      ? "border-l border-border bg-primary/10 px-4 py-3 text-center dark:bg-primary/20"
                      : "border-l border-border bg-muted px-4 py-3 text-center"
                  }
                >
                  <div className="font-display text-base font-semibold text-foreground">
                    {tier.name}
                  </div>
                  <div className="font-display text-lg font-bold text-primary dark:text-foreground">
                    ${tier.price.toLocaleString()}
                  </div>
                  {isAnchor && (
                    <Badge variant="solid" className="mt-1">
                      Most popular
                    </Badge>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rowTitles.map((title, i) => (
            <tr key={title} className={i % 2 === 1 ? "bg-muted/40" : undefined}>
              <td className="sticky left-0 bg-inherit px-4 py-2.5 text-left text-foreground">
                {title}
              </td>
              {tiers.map((tier) => {
                const included = tierHasBenefit(tier.id, title);
                const isAnchor = tier.id === anchorTierId;
                return (
                  <td
                    key={tier.id}
                    className={
                      isAnchor
                        ? "border-l border-border bg-primary/[0.06] px-4 py-2.5 text-center dark:bg-primary/10"
                        : "border-l border-border px-4 py-2.5 text-center"
                    }
                  >
                    {included ? (
                      <Check
                        className="mx-auto size-4 text-lime"
                        aria-label="Included"
                      />
                    ) : (
                      <span
                        className="text-muted-foreground"
                        aria-label="Not included"
                      >
                        &ndash;
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {addons.length > 0 && (
          <tfoot>
            <tr>
              <td
                colSpan={tiers.length + 1}
                className="border-t border-border bg-muted px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                A la carte add-ons (any tier)
              </td>
            </tr>
            {addons.map((addon) => (
              <tr key={addon.id}>
                <td className="sticky left-0 bg-inherit px-4 py-2.5 text-left text-foreground">
                  {addon.name}
                </td>
                <td
                  colSpan={tiers.length}
                  className="border-l border-border px-4 py-2.5 text-center text-muted-foreground"
                >
                  {addon.priceNote ?? "Ask for pricing"}
                </td>
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}
