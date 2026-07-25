import {
  listCompanies,
  listTemplates,
  templateResponseRates,
  TEMPLATE_RESPONSE_WINDOW_DAYS,
} from "@/lib/data";
import { TemplatesWorkspace } from "./_components/templates-workspace";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default async function TemplatesPage() {
  const templates = await listTemplates();
  const companies = await listCompanies();
  const responseRates = await templateResponseRates();

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Reusable outreach messages with merge fields for company, contact, and tier."
      />

      <section className="mt-6 space-y-3">
        <SectionHeading>Response rates</SectionHeading>
        {responseRates.length === 0 ? (
          <Card className="items-center border-dashed py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No template-attributed sends yet. Pick a template when logging an
              outbound touch and its response rate will appear here.
            </p>
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead className="text-right">Sends</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead className="text-right">Response rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responseRates.map((r) => (
                  <TableRow key={r.templateId}>
                    <TableCell>
                      <span className="font-medium text-foreground">
                        {r.templateName}
                      </span>
                      {r.scenario && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          &middot; {r.scenario}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r.sends}</TableCell>
                    <TableCell className="text-right">{r.responses}</TableCell>
                    <TableCell className="text-right font-display font-bold text-primary dark:text-foreground">
                      {formatPct(r.responseRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          A send counts as answered when the same company sent an inbound touch
          within {TEMPLATE_RESPONSE_WINDOW_DAYS} days after it.
        </p>
      </section>

      <div className="mt-6">
        <TemplatesWorkspace templates={templates} companies={companies} />
      </div>
    </div>
  );
}
