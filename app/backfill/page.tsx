import {
  listCompanyOptions,
  listContactOptions,
  listDealOptions,
  listDeckVersionOptions,
  listRecentTouchpoints,
  listTemplateOptions,
} from "./queries";
import { BackfillClient } from "./backfill-client";
import { PageHeader } from "@/components/page-header";

/**
 * /backfill - rapid-entry page for migrating Gmail thread history into
 * Sponsor Engine. Same fields as the QuickLog modal, but laid out inline with
 * a prominent date field (past-dated entries are the common case here), and
 * stays open after each submit so you can log a whole thread quickly.
 */
export default async function BackfillPage() {
  const [companies, contacts, deals, deckVersions, templates, recent] =
    await Promise.all([
      listCompanyOptions(),
      listContactOptions(),
      listDealOptions(),
      listDeckVersionOptions(),
      listTemplateOptions(),
      listRecentTouchpoints(20),
    ]);

  return (
    <div>
      <PageHeader
        title="Backfill"
        subtitle="Rapid-entry mode for migrating Gmail thread history. Pick a date, log the touch, and the form stays open for the next one."
      />

      <BackfillClient
        companies={companies}
        contacts={contacts}
        deals={deals}
        deckVersions={deckVersions}
        templates={templates}
        initialRecent={recent}
      />
    </div>
  );
}
