import { companiesOnOutdatedDeck, listDeckVersions } from "@/lib/data";
import { OutdatedDeckWarning } from "./outdated-deck-warning";
import { CreateDeckVersionForm } from "./create-deck-version-form";
import { DeckVersionList } from "./deck-version-list";
import { PageHeader, SectionHeading } from "@/components/page-header";

export default async function DecksPage() {
  const versions = await listDeckVersions();
  const outdated = await companiesOnOutdatedDeck();
  const current = versions.find((v) => v.isCurrent) ?? null;

  return (
    <div>
      <PageHeader
        title="Decks"
        subtitle="Pitch-deck versions and which companies last saw an outdated deck."
      />

      <OutdatedDeckWarning outdated={outdated} currentLabel={current?.label ?? null} />

      <div className="mt-2">
        <CreateDeckVersionForm />
      </div>

      <div className="mt-6 space-y-3">
        <SectionHeading>Deck versions</SectionHeading>
        <DeckVersionList versions={versions} />
      </div>
    </div>
  );
}
