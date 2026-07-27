// Orchestration + messaging for the Apollo People Scraper. Uses the pure DOM
// helpers from scraper.js (loaded first). Talks to popup.js via runtime messages:
//   popup -> tab:  APOLLO_SCRAPE_START { allPages, maxPages }
//   popup -> tab:  APOLLO_SCRAPE_GET_LAST         (re-fetch after popup reopens)
//   tab -> popup:  APOLLO_SCRAPE_PROGRESS { phase, page, count }
//   tab -> popup:  APOLLO_SCRAPE_DONE { result }  (also kept in lastResult)
//   tab -> popup:  APOLLO_SCRAPE_ERROR { message }

let lastResult = null;
let running = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function notify(msg) {
  // Popup may be closed; ignore "no receiver" errors.
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// Wait until the top row has a NON-EMPTY identity different from `before`.
// Apollo empties the table while a page loads, so "changed" alone is not enough -
// an empty key means "still rendering", not "new page ready".
async function waitForRows(before, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const key = apolloFirstRowKey();
    if (key && key !== before) return true;
    await sleep(300);
  }
  return false;
}

// Click `label` ("Previous"/"Next") and wait for the new page to render.
// Returns false when the button is missing/disabled or rows never re-appeared.
async function step(label) {
  const btn = document.querySelector(`button[aria-label="${label}"]`);
  if (!btn || btn.disabled) return false;
  const before = apolloFirstRowKey();
  btn.click();
  if (!(await waitForRows(before))) return false;
  await sleep(1200 + Math.random() * 800); // be gentle with Apollo
  return true;
}

async function scrape({ allPages, maxPages }) {
  const seen = new Set();
  const people = [];
  let pages = 0;

  const collect = () => {
    for (const p of apolloScrapePage()) {
      const key = p.apolloId || p.linkedin || `${p.name}|${p.company || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      people.push(p);
    }
  };

  if (allPages) {
    // Rewind to page 1 so a scrape started mid-list still captures everything.
    notify({ type: 'APOLLO_SCRAPE_PROGRESS', phase: 'rewinding', page: 0, count: 0 });
    while (await step('Previous'));
  }

  // The table may still be rendering (fresh load or rewind); a timeout here is
  // fine - it just means the search genuinely has no rows.
  await waitForRows('', 10000);

  for (;;) {
    pages++;
    collect();
    notify({ type: 'APOLLO_SCRAPE_PROGRESS', phase: 'scraping', page: pages, count: people.length });
    if (!allPages || pages >= maxPages) break;
    if (!(await step('Next'))) break;
  }

  return {
    scrapedAt: new Date().toISOString(),
    pageUrl: location.href,
    pagesScraped: pages,
    count: people.length,
    people,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'APOLLO_SCRAPE_GET_LAST') {
    sendResponse({ running, result: lastResult });
    return;
  }
  if (msg.type !== 'APOLLO_SCRAPE_START') return;
  if (running) {
    sendResponse({ ok: false, error: 'A scrape is already running.' });
    return;
  }
  running = true;
  sendResponse({ ok: true });
  scrape({ allPages: !!msg.allPages, maxPages: msg.maxPages || 200 })
    .then((result) => {
      lastResult = result;
      notify({ type: 'APOLLO_SCRAPE_DONE', result });
    })
    .catch((err) => notify({ type: 'APOLLO_SCRAPE_ERROR', message: String(err) }))
    .finally(() => {
      running = false;
    });
});
