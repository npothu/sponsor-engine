import "server-only";
import type { ReportData } from "./queries";
import { formatMoney, formatDate, formatDateTime, pct } from "./format";

/**
 * Build a self-contained, static HTML snapshot of the report - no external
 * assets, no client JS, inline CSS only - so you can email it straight to
 * the board or archive it. Mirrors the on-screen report's structure and
 * board-safe scope (no contact info, no edit affordances).
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildReportHtml(data: ReportData): string {
  const {
    cycle,
    generatedAt,
    revenue,
    anchorTier,
    pipeline,
    recentWins,
    upcomingDeliverables,
    risks,
  } = data;

  const committedPct = pct(revenue.committedTotal, revenue.goal);
  const anchorPct = pct(revenue.anchorCount, revenue.anchorTarget);

  const pipelineRows = pipeline
    .filter((row) => row.companies.length > 0)
    .map(
      (row) => `
        <tr>
          <td class="stage">${esc(row.label)}</td>
          <td class="companies">${row.companies.map((c) => esc(c.name)).join(", ")}</td>
          <td class="num">${row.companies.length}</td>
          <td class="num">${esc(formatMoney(row.dollars))}</td>
        </tr>`,
    )
    .join("");

  const winsRows = recentWins.length
    ? recentWins
        .map(
          (w) => `
        <tr>
          <td>${esc(w.companyName)}</td>
          <td>${esc(w.stageLabel)}</td>
          <td>${esc(w.tierName ?? "—")}</td>
          <td class="num">${esc(formatMoney(w.askAmount))}</td>
          <td>${esc(formatDate(w.stageEnteredAt))}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No deals reached committed status in the last 60 days.</td></tr>`;

  const deliverableRows = upcomingDeliverables.length
    ? upcomingDeliverables
        .map(
          (d) => `
        <tr>
          <td>${esc(d.companyName)}</td>
          <td>${esc(d.title)}</td>
          <td>${esc(d.owner ?? "Unassigned")}</td>
          <td>${esc(formatDate(d.dueDate))}</td>
          <td>${esc(d.status)}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="empty">No deliverables due in the next 30 days.</td></tr>`;

  const riskRows = risks.length
    ? risks
        .map(
          (r) => `
        <tr>
          <td>${esc(r.companyName)}</td>
          <td>${esc(r.stageLabel)}</td>
          <td class="num">${r.daysStale}d</td>
          <td>${esc(formatDate(r.lastActivityAt))}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="empty">No stalled deals right now.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sponsorship - Status Report (${esc(cycle)})</title>
<style>
  :root {
    --accent: #059669;
    --border: #d8dfdc;
    --muted: #5b6b67;
    --bg-soft: #f4f7f6;
  }
  * { box-sizing: border-box; }
  body {
    background: #ffffff;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 2.5rem 3rem 4rem;
  }
  h1 { font-size: 1.5rem; margin: 0 0 0.2rem; }
  h2 { font-size: 1.05rem; margin: 0 0 0.75rem; color: #111827; }
  .meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 2rem; }
  .section { margin-bottom: 2.25rem; }
  .stat-grid { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .stat-card {
    flex: 1 1 200px;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem 1.1rem;
    background: var(--bg-soft);
  }
  .stat-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  .stat-value { font-size: 1.4rem; font-weight: 700; margin-top: 0.25rem; }
  .stat-sub { font-size: 0.82rem; color: var(--muted); margin-top: 0.15rem; }
  .bar-track {
    background: #e5eae8;
    border-radius: 999px;
    height: 8px;
    margin-top: 0.6rem;
    overflow: hidden;
  }
  .bar-fill { background: var(--accent); height: 100%; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th, td { text-align: left; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--border); }
  th {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 600;
  }
  td.num, th.num { text-align: right; }
  td.stage { font-weight: 600; white-space: nowrap; }
  td.companies { color: #374151; }
  td.empty { color: var(--muted); font-style: italic; text-align: center; padding: 1.25rem; }
  .footer { margin-top: 3rem; color: var(--muted); font-size: 0.78rem; border-top: 1px solid var(--border); padding-top: 1rem; }
</style>
</head>
<body>
  <h1>Sponsorship - Status Report</h1>
  <div class="meta">Cycle ${esc(cycle)} &middot; Generated ${esc(formatDateTime(generatedAt))}</div>

  <div class="section">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Committed revenue</div>
        <div class="stat-value">${esc(formatMoney(revenue.committedTotal))}</div>
        <div class="stat-sub">of ${esc(formatMoney(revenue.goal))} goal (${committedPct}%)</div>
        <div class="bar-track"><div class="bar-fill" style="width:${committedPct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Weighted pipeline</div>
        <div class="stat-value">${esc(formatMoney(revenue.weightedPipeline))}</div>
        <div class="stat-sub">probability-adjusted, active deals</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Anchor (${esc(anchorTier?.name ?? "top")} tier) progress</div>
        <div class="stat-value">${revenue.anchorCount} of ${revenue.anchorTarget}</div>
        <div class="stat-sub">${anchorPct}% of anchor goal</div>
        <div class="bar-track"><div class="bar-fill" style="width:${anchorPct}%"></div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Pipeline by stage</h2>
    <table>
      <thead>
        <tr><th>Stage</th><th>Companies</th><th class="num">Count</th><th class="num">Dollars</th></tr>
      </thead>
      <tbody>${pipelineRows || `<tr><td colspan="4" class="empty">No deals in this cycle yet.</td></tr>`}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Recent wins (last 60 days)</h2>
    <table>
      <thead>
        <tr><th>Company</th><th>Stage</th><th>Tier</th><th class="num">Ask</th><th>Since</th></tr>
      </thead>
      <tbody>${winsRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Upcoming deliverables (next 30 days)</h2>
    <table>
      <thead>
        <tr><th>Company</th><th>Deliverable</th><th>Owner</th><th>Due</th><th>Status</th></tr>
      </thead>
      <tbody>${deliverableRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Stalled / at risk</h2>
    <table>
      <thead>
        <tr><th>Company</th><th>Stage</th><th class="num">Stale</th><th>Last activity</th></tr>
      </thead>
      <tbody>${riskRows}</tbody>
    </table>
  </div>

  <div class="footer">
    Sponsorship Pipeline &middot; Sponsor Engine &middot; board-safe snapshot (no contact details included)
  </div>
</body>
</html>
`;
}
