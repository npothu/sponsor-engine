"use client";

import { useState, useTransition } from "react";
import { generateReportHtml } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * Triggers a client-side download of the static HTML snapshot generated
 * server-side by generateReportHtml(). No page navigation, no edit controls -
 * just a file save so you can email the report to the board.
 */
export function DownloadReportButton({ cycle }: { cycle: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const html = await generateReportHtml(cycle);
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `sponsorship-report-${cycle}-${dateStamp}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        setError("Could not generate the report file. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? "Generating…" : "Download HTML"}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
