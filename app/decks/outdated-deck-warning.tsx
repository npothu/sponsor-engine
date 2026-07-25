import Link from "next/link";
import type { OutdatedDeckCompany } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function OutdatedDeckWarning({
  outdated,
  currentLabel,
}: {
  outdated: OutdatedDeckCompany[];
  currentLabel: string | null;
}) {
  if (outdated.length === 0) return null;

  return (
    <Card className="mb-6 gap-3 border-l-4 border-l-(--tier-gold-fg) bg-muted px-5 py-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge variant="warning">Outdated deck</Badge>
        <span className="text-sm font-semibold text-foreground">
          These companies are negotiating off an outdated deck
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {outdated.map(({ company, lastDeckVersion, lastSharedAt }) => (
          <li
            key={company.id}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <Link
              href={`/companies?search=${encodeURIComponent(company.name)}`}
              className="text-primary underline-offset-4 hover:underline dark:text-lime"
            >
              {company.name}
            </Link>
            <span className="text-muted-foreground">
              saw <strong className="font-semibold text-foreground">{lastDeckVersion.label}</strong> on{" "}
              {formatDate(lastSharedAt)}
              {currentLabel ? (
                <>
                  {" "}
                  - current is{" "}
                  <strong className="font-semibold text-foreground">{currentLabel}</strong>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default OutdatedDeckWarning;
