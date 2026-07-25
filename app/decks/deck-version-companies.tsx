"use client";

import { useState } from "react";
import Link from "next/link";
import type { DeckVersionCompany } from "./queries";
import { Button } from "@/components/ui/button";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function DeckVersionCompanies({
  companies,
}: {
  companies: DeckVersionCompany[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide" : "Show"} companies ({companies.length})
      </Button>

      {open && (
        <div className="mt-3">
          {companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No company has this as their most recently shared deck.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {companies.map(({ company, sharedAt }) => (
                <li
                  key={company.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2"
                >
                  <Link
                    href={`/companies?search=${encodeURIComponent(company.name)}`}
                    className="text-primary underline-offset-4 hover:underline dark:text-lime"
                  >
                    {company.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    shared {formatDate(sharedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default DeckVersionCompanies;
