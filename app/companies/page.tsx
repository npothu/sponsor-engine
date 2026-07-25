import Link from "next/link";
import type { CompanyPriority, CompanyType } from "@/lib/schema";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCompanyRows } from "./queries";
import { NewCompanyForm } from "./new-company-form";
import {
  DEAL_STAGES,
  PRIORITIES,
  PRIORITY_LABEL,
  PriorityBadge,
  STAGE_LABEL,
  StageBadge,
  TypeBadge,
  formatDate,
  formatMoney,
  dueTone,
} from "./ui";

/**
 * /companies - the searchable, filterable roster. Filters (type, stage, name)
 * are driven entirely by URL searchParams so the view is shareable and the back
 * button works. Stage filtering is applied against each company's primary deal.
 */

interface SearchParams {
  q?: string;
  type?: string;
  priority?: string;
  stage?: string;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const typeFilter =
    sp.type === "corporate" || sp.type === "community"
      ? (sp.type as CompanyType)
      : undefined;
  const priorityFilter =
    sp.priority === "high" || sp.priority === "medium" || sp.priority === "low"
      ? (sp.priority as CompanyPriority)
      : undefined;
  const stageFilter = DEAL_STAGES.includes(sp.stage as never)
    ? sp.stage
    : undefined;

  let rows = await listCompanyRows({
    type: typeFilter,
    priority: priorityFilter,
    search: q || undefined,
  });
  if (stageFilter) {
    rows = rows.filter((r) => r.stage === stageFilter);
  }

  const total = rows.length;
  const hasFilters = Boolean(q || typeFilter || priorityFilter || stageFilter);

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle="Every corporate and community sponsor, with contacts, deals, and history."
        actions={<NewCompanyForm />}
      />

      {/* Filter bar - a GET form so state lives in the URL. */}
      <Card className="mb-6">
        <CardContent>
          <form
            method="get"
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 basis-[220px]">
              <Label htmlFor="f-q">Search</Label>
              <Input
                id="f-q"
                name="q"
                placeholder="Company name"
                defaultValue={q}
              />
            </div>
            <div className="w-40">
              <Label htmlFor="f-type">Type</Label>
              <Select id="f-type" name="type" defaultValue={sp.type ?? ""}>
                <option value="">All types</option>
                <option value="corporate">Corporate</option>
                <option value="community">Community</option>
              </Select>
            </div>
            <div className="w-40">
              <Label htmlFor="f-priority">Priority</Label>
              <Select
                id="f-priority"
                name="priority"
                defaultValue={sp.priority ?? ""}
              >
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Label htmlFor="f-stage">Stage</Label>
              <Select id="f-stage" name="stage" defaultValue={sp.stage ?? ""}>
                <option value="">All stages</option>
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Apply</Button>
            {hasFilters && (
              <Button asChild variant="outline">
                <Link href="/companies">Clear</Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {total === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Ask</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Last touch</TableHead>
                <TableHead>Next action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const tone = r.nextActionDue ? dueTone(r.nextActionDue) : null;
                return (
                  <TableRow key={r.company.id}>
                    <TableCell>
                      <Link
                        href={`/companies/${r.company.id}`}
                        className="font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        {r.company.name}
                      </Link>
                      {r.cycle && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.cycle}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={r.company.type} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={r.company.priority} />
                    </TableCell>
                    <TableCell>
                      {r.stage ? (
                        <StageBadge stage={r.stage} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(r.askAmount)}
                    </TableCell>
                    <TableCell>
                      {r.tier ? (
                        r.tier.name
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          r.lastTouchAt ? undefined : "text-muted-foreground"
                        }
                      >
                        {formatDate(r.lastTouchAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.nextActionDue ? (
                        <span
                          title={r.nextActionTitle ?? undefined}
                          className={
                            tone === "overdue"
                              ? "font-semibold text-destructive"
                              : tone === "today"
                                ? "font-semibold text-info"
                                : "text-foreground"
                          }
                        >
                          {formatDate(r.nextActionDue)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {total} {total === 1 ? "company" : "companies"}
      </p>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center">
        <p className="text-base font-semibold text-foreground">
          {hasFilters
            ? "No companies match those filters"
            : "No companies yet"}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {hasFilters
            ? "Try clearing the search or filters."
            : "Add your first sponsor with the New company button."}
        </p>
      </CardContent>
    </Card>
  );
}
