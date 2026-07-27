import { listCompanies, listDiscordInbox } from "@/lib/data";
import { readBotStatus } from "./bot-status";
import { SetupPanel } from "./setup-panel";
import { PendingMessage } from "./pending-message";
import { HistorySection } from "./history-section";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Everything on this page is written by the bot, a separate process the app
 * never hears from: captured messages and the status heartbeat both arrive in
 * the database with no request and no revalidatePath() to invalidate a cached
 * render. Prerendered, this page served build-time state forever - which is how
 * a running bot came to be reported as "Not configured" in production.
 */
export const dynamic = "force-dynamic";

export default async function DiscordPage() {
  const pending = await listDiscordInbox("pending");
  const attached = await listDiscordInbox("attached");
  const dismissed = await listDiscordInbox("dismissed");
  const history = [...attached, ...dismissed].sort((a, b) => {
    const av = a.postedAt ?? a.createdAt;
    const bv = b.postedAt ?? b.createdAt;
    return av < bv ? 1 : av > bv ? -1 : 0;
  });
  const companies = await listCompanies();
  const status = await readBotStatus();

  return (
    <div>
      <PageHeader
        title="Discord inbox"
        subtitle="Review sponsorship-channel messages the bot captured. Attach each to a company or dismiss it."
      />

      <div className="space-y-8">
        <SetupPanel status={status} />

        <section className="space-y-3">
          <SectionHeading>Pending ({pending.length})</SectionHeading>

          {pending.length === 0 ? (
            <Card className="border-dashed">
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No pending messages. Run{" "}
                  <code className="rounded-md bg-accent px-1.5 py-0.5 text-[0.82em] text-foreground">
                    /scrape
                  </code>{" "}
                  in Discord or wait for the bot to capture new posts in your
                  configured channels.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3.5">
              {pending.map((m) => (
                <PendingMessage key={m.id} message={m} companies={companies} />
              ))}
            </div>
          )}
        </section>

        <HistorySection messages={history} companies={companies} />
      </div>
    </div>
  );
}
