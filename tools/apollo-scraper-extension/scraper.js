// Pure DOM-scraping functions for the Apollo.io people table. No side effects,
// no messaging - content.js orchestrates. Loaded before content.js (same
// isolated world), so these are plain globals.
//
// Selector notes (update here if Apollo redesigns the table):
// - Rows are [role="row"]; the header row has no name anchor and is skipped.
// - The name cell links to "#/people/<id>" (net-new) or "#/contacts/<id>" (saved).
// - The company cell is the "#/accounts/<id>" anchor with visible text
//   (an icon-only accounts anchor with empty text also exists).
// - The title has no anchor; row text starts with "<name><title><company>",
//   so the title is sliced out between the two.
// - Pagination: button[aria-label="Next"], disabled on the last page.

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from content.js; shared as a plain global (manifest loads scraper.js before content.js in the same isolated world)
function apolloScrapePage() {
  const people = [];
  for (const row of document.querySelectorAll('[role="row"]')) {
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
  return people;
}

// Identity of the top row - used to detect when a page change has rendered.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from content.js; shared as a plain global (manifest loads scraper.js before content.js in the same isolated world)
function apolloFirstRowKey() {
  const a = document.querySelector('[role="row"] a[href*="#/people/"], [role="row"] a[href*="#/contacts/"]');
  return a ? a.getAttribute('href') + '|' + a.textContent : '';
}
