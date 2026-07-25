"use client";

import { useState, useTransition } from "react";
import {
  previewBulkImportAction,
  commitBulkImportAction,
  type ImportPreview,
  type ImportResult,
} from "./actions";
import type { SourceDef } from "./sources";
import { sourceLabelClient } from "./source-label";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "@/components/page-header";

/**
 * Bulk-import panel. Paste one company per line as "Name" or "Name | website",
 * pick a source for the whole batch, then Preview to see which lines are
 * duplicates before committing. Commit dedupes and reports added/skipped.
 */
export function BulkImport({ sources }: { sources: readonly SourceDef[] }) {
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [source, setSource] = useState("cold_research");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setBulk("");
    setPreview(null);
    setResult(null);
  }

  function runPreview() {
    const fd = new FormData();
    fd.set("bulk", bulk);
    fd.set("source", source);
    setResult(null);
    startTransition(async () => {
      setPreview(await previewBulkImportAction(fd));
    });
  }

  function commit() {
    const fd = new FormData();
    fd.set("bulk", bulk);
    fd.set("source", source);
    startTransition(async () => {
      const res = await commitBulkImportAction(fd);
      setResult(res);
      setPreview(null);
      setBulk("");
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Bulk import
      </Button>
    );
  }

  return (
    <Card className="w-full px-5 py-4">
      <div className="flex items-center justify-between px-5">
        <SectionHeading>Bulk import</SectionHeading>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Close
        </Button>
      </div>

      <div className="grid grid-cols-[2fr_1fr] items-start gap-3.5 px-5 pt-4">
        <div>
          <Label htmlFor="bi-bulk">
            One company per line - &ldquo;Name&rdquo; or &ldquo;Name |
            website&rdquo;
          </Label>
          <Textarea
            id="bi-bulk"
            rows={7}
            value={bulk}
            onChange={(e) => {
              setBulk(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            placeholder={"Acme Corp | https://acme.com\nGlobex\nInitech | initech.com"}
            className="font-mono text-sm"
          />
        </div>
        <div>
          <Label htmlFor="bi-source">Source (whole batch)</Label>
          <Select
            id="bi-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-5 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={runPreview}
          disabled={pending || !bulk.trim()}
        >
          {pending && !result ? "Checking..." : "Preview"}
        </Button>
        {preview && preview.addable > 0 && (
          <Button type="button" onClick={commit} disabled={pending}>
            Add {preview.addable}{" "}
            {preview.addable === 1 ? "company" : "companies"}
          </Button>
        )}
      </div>

      {result && (
        <div className="mx-5 mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">
          Added <strong>{result.added}</strong>, skipped{" "}
          <strong>{result.skipped}</strong>{" "}
          {result.skipped === 1 ? "duplicate" : "duplicates"}.
        </div>
      )}

      {preview && (
        <div className="px-5 pt-4">
          <div className="mb-2 flex justify-between">
            <SectionHeading className="text-sm">
              Preview - source {sourceLabelClient(sources, preview.source)}
            </SectionHeading>
            <span className="text-sm text-muted-foreground">
              {preview.addable} new, {preview.duplicates} duplicate
              {preview.duplicates === 1 ? "" : "s"}
            </span>
          </div>

          {preview.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No parseable lines. Enter at least one company name.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-muted">
              {preview.rows.map((r, i) => (
                <div
                  key={`${r.name}-${i}`}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3.5 py-2",
                    i !== 0 && "border-t border-border",
                    r.duplicate && "opacity-60",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2.5">
                      <span
                        className={cn(
                          "font-semibold",
                          r.duplicate
                            ? "text-muted-foreground line-through"
                            : "text-foreground",
                        )}
                      >
                        {r.name}
                      </span>
                      {r.website && (
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                          {r.website}
                        </span>
                      )}
                    </span>
                    {r.duplicate && r.duplicateOf && (
                      <span className="text-xs text-muted-foreground">
                        Possible duplicate of {r.duplicateOf}
                        {r.matchKind === "host"
                          ? " (same website)"
                          : " (same name)"}
                      </span>
                    )}
                  </span>
                  {r.duplicate ? (
                    <Badge variant="secondary" className="shrink-0">
                      Duplicate
                    </Badge>
                  ) : (
                    <Badge className="shrink-0">New</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
