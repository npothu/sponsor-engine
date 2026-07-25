"use server";

import { getReportData } from "./queries";
import { buildReportHtml } from "./export-html";

/**
 * Generate the self-contained static HTML snapshot for the current report.
 * Read-only: builds the HTML string server-side from the same queries backing
 * the on-screen report; the client triggers the actual file download.
 */
export async function generateReportHtml(cycle?: string): Promise<string> {
  const data = await getReportData(cycle);
  return buildReportHtml(data);
}
