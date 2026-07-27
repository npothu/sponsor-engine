"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ingestScrapeAction, type IngestScrapeResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "@/components/page-header";

/**
 * Paste box for Apollo scrape JSON. The extension's "Copy JSON" button puts the
 * whole result on the clipboard; pasting it here stages every person as a
 * pending inbox row (already-seen people are skipped, including past rejects).
 */
export function PastePanel() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<IngestScrapeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function ingest() {
    const fd = new FormData();
    fd.set("payload", payload);
    startTransition(async () => {
      const res = await ingestScrapeAction(fd);
      setResult(res);
      if (!res.error) {
        setPayload("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Paste scrape JSON
      </Button>
    );
  }

  return (
    <Card className="w-full px-5 py-4">
      <div className="flex items-center justify-between px-5">
        <SectionHeading>Paste scrape JSON</SectionHeading>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setPayload("");
            setResult(null);
            setOpen(false);
          }}
        >
          Close
        </Button>
      </div>

      <div className="px-5 pt-4">
        <Label htmlFor="triage-payload">
          Apollo scraper output - use the extension&apos;s Copy JSON button
        </Label>
        <Textarea
          id="triage-payload"
          rows={6}
          value={payload}
          onChange={(e) => {
            setPayload(e.target.value);
            setResult(null);
          }}
          placeholder='{"scrapedAt": "...", "people": [{"name": "...", "title": "...", "company": "...", "linkedin": "..."}]}'
          className="font-mono text-xs"
        />
      </div>

      <div className="flex items-center gap-3 px-5 pt-4">
        <Button
          type="button"
          onClick={ingest}
          disabled={pending || !payload.trim()}
        >
          {pending ? "Staging..." : "Stage for review"}
        </Button>
        {result &&
          (result.error ? (
            <span className="text-sm text-destructive">{result.error}</span>
          ) : (
            <span className="text-sm text-muted-foreground">
              Staged <strong className="text-foreground">{result.added}</strong>{" "}
              of {result.parsed} people
              {result.duplicates > 0 && (
                <> - {result.duplicates} already in the inbox</>
              )}
              {result.malformed > 0 && (
                <> - {result.malformed} unparseable entr{result.malformed === 1 ? "y" : "ies"}</>
              )}
              .
            </span>
          ))}
      </div>
    </Card>
  );
}
