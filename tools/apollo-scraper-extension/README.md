# Apollo People Scraper (Chrome extension)

Scrapes the Apollo.io people table - current page or **all pages in one go** - into
JSON + CSV downloads, without spending Apollo export credits.

## Install (once)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (`tools/apollo-scraper-extension`).
4. Reload any Apollo tab that was already open.

## Use

1. Open your people search at `app.apollo.io/#/people` (any page of it - "all pages"
   rewinds to page 1 first, so you don't need to be at the start).
2. Click the extension icon → **Scrape all pages** (or **Scrape this page**).
3. When it finishes, click **Copy JSON for Triage** and paste into Sponsor
   Engine's **Triage** page (`/triage`), where each contact is kept or rejected
   before entering the tracker.
   The result also auto-downloads as `apollo-scrape-<date>.json` and
   `apollo-scrape-<date>.csv` (same fields: `name, apolloId, title, company, linkedin`)
   if you want a file copy; move files into `scripts/data/` if the batch is for
   the pipeline.

The popup can be closed mid-scrape; the scrape keeps running in the tab. Reopen the
popup to see progress or re-download the last result.

## Behavior notes

- Paginates by clicking Apollo's own Previous/Next buttons with a 1.2-2s pause per
  page, and waits for rows to re-render before scraping (Apollo empties the table
  while a page loads).
- Dedupes across pages on `apolloId` (falls back to linkedin, then name+company).
- Stops at the last page (disabled Next), after 200 pages, or if a page never renders.
- Only reads the DOM of `app.apollo.io` - no background service worker, no external
  requests, no storage, no permissions beyond the content script.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest - content script on `app.apollo.io`, popup action |
| `scraper.js` | Pure DOM scraping helpers (row/name/company/pagination selectors live here) |
| `content.js` | Orchestration: rewind, paginate, dedupe, progress/result messaging |
| `popup.html` / `popup.js` | UI: start scrape, show progress, copy JSON for /triage, download JSON + CSV |
| `csv.js` | CSV serialization (shared field list, RFC-4180 quoting) |

If Apollo redesigns the table and scrapes come back empty, fix the selectors in
`scraper.js` - nothing else should need to change.
