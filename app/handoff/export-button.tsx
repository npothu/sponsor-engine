"use client";

import { useState } from "react";
import { buildHandoffMarkdown } from "./actions";
import { Button } from "@/components/ui/button";

/**
 * Triggers the server action that builds the handoff Markdown, then downloads
 * the result client-side as sponsor-engine-handoff-<cycle>.md. This is the only
 * interactive control on an otherwise read-only page.
 */
export function ExportButton({ cycle }: { cycle: string }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const markdown = await buildHandoffMarkdown();
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sponsor-engine-handoff-${cycle}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" onClick={handleExport} disabled={busy}>
      {busy ? "Building..." : "Export handoff document"}
    </Button>
  );
}
