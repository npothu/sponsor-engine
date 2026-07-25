"use client";

import { useState } from "react";
import type { Company } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PriorityBadge, RelationshipBadge, TypeBadge } from "../ui";
import { updateCompanyDetailsAction } from "../actions";

/** Company profile header: name + type badge, website/source, inline edit. */
export function CompanyHeader({
  company,
  relationship,
}: {
  company: Company;
  /** cross-cycle relationship classification for the relationship badge */
  relationship: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card className="mb-6">
        <CardContent>
          <form
            action={async (fd) => {
              await updateCompanyDetailsAction(fd);
              setEditing(false);
            }}
          >
            <input type="hidden" name="companyId" value={company.id} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
              <div>
                <Label htmlFor="ch-name">Name</Label>
                <Input
                  id="ch-name"
                  name="name"
                  required
                  defaultValue={company.name}
                />
              </div>
              <div>
                <Label htmlFor="ch-type">Type</Label>
                <Select id="ch-type" name="type" defaultValue={company.type}>
                  <option value="corporate">Corporate</option>
                  <option value="community">Community</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="ch-priority">Priority</Label>
                <Select
                  id="ch-priority"
                  name="priority"
                  defaultValue={company.priority}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="ch-website">Website</Label>
                <Input
                  id="ch-website"
                  name="website"
                  defaultValue={company.website ?? ""}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label htmlFor="ch-source">Source</Label>
                <Input
                  id="ch-source"
                  name="source"
                  defaultValue={company.source ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="ch-reaskon">Ask again on</Label>
                <Input
                  id="ch-reaskon"
                  name="reAskOn"
                  type="date"
                  defaultValue={company.reAskOn ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="ch-reaskreason">Re-ask reason</Label>
                <Input
                  id="ch-reaskreason"
                  name="reAskReason"
                  defaultValue={company.reAskReason ?? ""}
                  placeholder="e.g. budget resets in the fall"
                />
              </div>
              <div>
                <Label htmlFor="ch-fiscal-year-end">Fiscal year end</Label>
                <Input
                  id="ch-fiscal-year-end"
                  name="fiscalYearEnd"
                  type="date"
                  defaultValue={company.fiscalYearEnd ?? ""}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="submit" size="sm">
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[1.7rem] font-bold leading-tight text-primary dark:text-foreground">
            {company.name}
          </h1>
          <TypeBadge type={company.type} />
          <PriorityBadge priority={company.priority} />
          <RelationshipBadge relationship={relationship} />
        </div>
        <div className="diamond-rule mt-2" aria-hidden>
          <span />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {company.website ? (
            <a
              className="text-primary underline-offset-4 hover:underline dark:text-lime"
              href={company.website}
              target="_blank"
              rel="noreferrer"
            >
              {company.website.replace(/^https?:\/\//, "")}
            </a>
          ) : null}
          {company.source && (
            <span className="text-muted-foreground">
              Source: {company.source}
            </span>
          )}
          {company.reAskOn && (
            <span
              className="text-muted-foreground"
              title={company.reAskReason ?? undefined}
            >
              Ask again on {company.reAskOn}
              {company.reAskReason ? ` (${company.reAskReason})` : ""}
            </span>
          )}
          {company.fiscalYearEnd && (
            <span className="text-muted-foreground">
              Fiscal year ends {company.fiscalYearEnd}
            </span>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setEditing(true)}
      >
        Edit details
      </Button>
    </header>
  );
}
