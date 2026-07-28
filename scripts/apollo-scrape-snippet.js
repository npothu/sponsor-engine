// Apollo.io people-table scraper (current screen only - no exports, no credits).
//
// Scrapes the visible people table on app.apollo.io/#/people and produces JSON:
//   { scrapedAt, pageUrl, count, people: [{ name, apolloId, title, company, linkedin }] }
// Only `name` is required downstream; the rest are captured because they are
// already on screen and cost nothing. `apolloId` is the dedupe key across pages.
//
// Two ways to run it:
// 1. Agent (claude-in-chrome / browser tools): set `window.__apolloScrapeNoDownload = true`,
//    then execute this file's contents with the javascript tool on the Apollo tab;
//    the last expression returns the JSON. Save it wherever you stage scraped
//    batches (e.g. a private sibling data repo - see CLAUDE.md).
// 2. Human: paste the whole file into the DevTools console on the Apollo tab.
//    It logs the JSON and downloads apollo-scrape-<date>.json. Either way, the
//    output pastes straight into the app's Triage page.
//
// Selector notes (may need updating if Apollo changes its DOM):
// - Rows are [role="row"]; the header row has no name anchor and is skipped.
// - The name cell is the anchor to "#/people/<id>" (net-new prospects) or
//   "#/contacts/<id>" (already-saved contacts).
// - The company cell is the anchor to "#/accounts/<id>" that has visible text
//   (there is also an icon-only accounts anchor with empty text).
// - The title has no anchor of its own; the row text starts with
//   "<name><title><company>", so the title is sliced out between the two.

(() => {
  const rows = [...document.querySelectorAll('[role="row"]')];
  const people = [];
  for (const row of rows) {
    const nameA = row.querySelector('a[href*="#/people/"], a[href*="#/contacts/"]');
    if (!nameA) continue; // header row
    const name = nameA.textContent.trim();
    if (!name) continue;
    const idMatch = (nameA.getAttribute('href') || '').match(/#\/(?:people|contacts)\/([a-f0-9]+)/);
    const companyA = [...row.querySelectorAll('a[href*="#/accounts/"]')].find((a) => a.textContent.trim());
    const company = companyA ? companyA.textContent.trim() : null;
    const linkedinA = row.querySelector('a[href*="linkedin.com/in/"]');

    let title = null;
    const rowText = (row.textContent || '').trim();
    if (company && rowText.startsWith(name)) {
      const rest = rowText.slice(name.length);
      const cut = rest.indexOf(company);
      if (cut > 0) title = rest.slice(0, cut).trim() || null;
    }

    people.push({
      name,
      apolloId: idMatch ? idMatch[1] : null,
      title,
      company,
      linkedin: linkedinA ? linkedinA.getAttribute('href') : null,
    });
  }

  const result = {
    scrapedAt: new Date().toISOString(),
    pageUrl: location.href,
    count: people.length,
    people,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!window.__apolloScrapeNoDownload) {
    const date = new Date().toISOString().slice(0, 10);
    const download = (text, mime, ext) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: mime }));
      a.download = `apollo-scrape-${date}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    const fields = ['name', 'apolloId', 'title', 'company', 'linkedin'];
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [fields.join(','), ...people.map((p) => fields.map((f) => esc(p[f])).join(','))].join('\r\n') + '\r\n';
    download(JSON.stringify(result, null, 2), 'application/json', 'json');
    download(csv, 'text/csv', 'csv');
  }
  return result;
})();
