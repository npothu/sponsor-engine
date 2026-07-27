import Link from "next/link";
import { notFound } from "next/navigation";
import {
  classifyCompanyRelationship,
  getCompanyDetail,
  getDealAddons,
  listTiers,
  listAddons,
  listDeckVersions,
  listTemplates,
} from "@/lib/data";
import { ACTIVE_STAGES } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyHeader } from "./company-header";
import { DealPanel } from "./deal-panel";
import { ComposeSection } from "./compose-section";
import { ContactsSection } from "./contacts-section";
import { TimelineSection } from "./timeline-section";
import { ActionsSection } from "./actions-section";
import { NotesSection } from "./notes-section";
import { AddDealForm } from "./add-deal-form";
import { OtherCycles } from "./other-cycles";

/**
 * /companies/[id] - the company profile. The single most important screen in
 * the app: header, primary deal, contacts, timeline, next actions, notes.
 */
export default async function CompanyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId) || companyId <= 0) notFound();

  const detail = await getCompanyDetail(companyId);
  if (!detail) notFound();

  const { company, contacts, deals, touchpoints, openActions } = detail;
  const tiers = await listTiers();
  const addons = await listAddons();
  const deckVersions = await listDeckVersions();
  const templates = await listTemplates();

  // The primary deal is the newest (data layer returns deals desc by createdAt).
  const primaryDeal = deals[0] ?? null;
  const primaryAddonIds = primaryDeal
    ? (await getDealAddons(primaryDeal.id)).map((a) => a.id)
    : [];

  const relationship = await classifyCompanyRelationship(companyId);

  const primaryIsActive = primaryDeal
    ? (ACTIVE_STAGES as readonly string[]).includes(primaryDeal.stage)
    : false;
  const primaryHasOpenAction = primaryDeal
    ? openActions.some((a) => a.dealId === primaryDeal.id)
    : false;

  return (
    <div>
      <Link
        href="/companies"
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        ← All companies
      </Link>

      <div className="mt-3">
        <CompanyHeader company={company} relationship={relationship} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column */}
        <div className="grid min-w-0 gap-5">
          <ContactsSection companyId={companyId} contacts={contacts} />
          <ComposeSection
            companyId={companyId}
            templates={templates}
            contacts={contacts}
            deals={deals}
          />
          <TimelineSection
            companyId={companyId}
            touchpoints={touchpoints}
            deals={deals}
            contacts={contacts}
            deckVersions={deckVersions}
          />
          <NotesSection company={company} />
        </div>

        {/* Side column */}
        <div id="deals" className="grid scroll-mt-6 gap-5">
          {primaryDeal ? (
            <DealPanel
              companyId={companyId}
              companyName={company.name}
              deal={primaryDeal}
              tiers={tiers}
              addons={addons}
              contacts={contacts}
              selectedAddonIds={primaryAddonIds}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Deal</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  No deal for this company yet.
                </p>
                <AddDealForm companyId={companyId} />
              </CardContent>
            </Card>
          )}

          <ActionsSection
            companyId={companyId}
            openActions={openActions}
            deals={deals}
            activeDealMissingAction={primaryIsActive && !primaryHasOpenAction}
          />

          {deals.length > 1 && (
            <OtherCycles
              companyId={companyId}
              deals={deals}
              primaryId={primaryDeal?.id}
            />
          )}

          {primaryDeal && (
            <Card>
              <CardContent>
                <AddDealForm companyId={companyId} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
