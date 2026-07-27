import { loadTriageData } from "./queries";
import { PastePanel } from "./paste-panel";
import { ReviewList } from "./review-list";
import { HistorySection } from "./history-section";
import { PageHeader, SectionHeading } from "@/components/page-header";

/**
 * Contact triage: scraped contacts (pasted from the Apollo scraper extension)
 * wait here as pending rows until a human keeps or rejects each one. Only kept
 * rows become real contacts, so scrapes never pollute the tracker; rejected
 * rows stay in the inbox as suppression so re-scrapes cannot resurface them.
 */
export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const { pending, kept, rejected } = await loadTriageData();

  return (
    <div>
      <PageHeader
        title="Contact triage"
        subtitle="Review scraped contacts before they enter the tracker. Keep creates the contact (matching or creating its company); reject records why so the person never comes back."
        actions={<PastePanel />}
      />

      <div className="space-y-8">
        <section className="space-y-3">
          <SectionHeading>Pending ({pending.length})</SectionHeading>
          <ReviewList rows={pending} />
        </section>

        <HistorySection kept={kept} rejected={rejected} />
      </div>
    </div>
  );
}
