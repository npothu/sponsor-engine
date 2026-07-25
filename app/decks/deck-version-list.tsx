import type { DeckVersion } from "@/lib/schema";
import { companiesForDeckVersion } from "./queries";
import { DeckVersionCompanies } from "./deck-version-companies";
import { SetCurrentButton } from "./set-current-button";
import { DeckLinkControls } from "./deck-link-controls";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function formatDate(iso: string | null): string {
  if (!iso) return "No release date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export async function DeckVersionList({ versions }: { versions: DeckVersion[] }) {
  if (versions.length === 0) {
    return (
      <Card className="items-center border-dashed py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No deck versions yet. Add the first one with the form above.
        </p>
      </Card>
    );
  }

  const versionsWithCompanies = await Promise.all(
    versions.map(async (version) => ({
      version,
      companies: await companiesForDeckVersion(version.id),
    })),
  );

  return (
    <div className="flex flex-col gap-3.5">
      {versionsWithCompanies.map(({ version, companies }) => {
        return (
          <Card key={version.id} className="px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-semibold text-primary dark:text-foreground">
                    {version.label}
                  </span>
                  {version.isCurrent && <Badge variant="solid">Current</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Released {formatDate(version.releasedAt)}
                </p>
                {version.description && (
                  <p className="mt-2 text-sm text-foreground">{version.description}</p>
                )}
                <div className="mt-3">
                  <DeckLinkControls deckVersionId={version.id} url={version.url} />
                </div>
              </div>
              {!version.isCurrent && <SetCurrentButton deckVersionId={version.id} />}
            </div>

            <Separator className="my-3.5" />

            <DeckVersionCompanies companies={companies} />
          </Card>
        );
      })}
    </div>
  );
}

export default DeckVersionList;
