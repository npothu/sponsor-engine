// Popup UI: kicks off a scrape in the content script, shows progress, and
// downloads the result as JSON + CSV (auto on completion, plus manual buttons).
// If the popup is closed mid-scrape the content script keeps going; reopening
// the popup fetches the last finished result via APOLLO_SCRAPE_GET_LAST.

const statusEl = document.getElementById('status');
const downloadsEl = document.getElementById('downloads');
const buttons = {
  page: document.getElementById('scrape-page'),
  all: document.getElementById('scrape-all'),
  copy: document.getElementById('copy-json'),
  json: document.getElementById('dl-json'),
  csv: document.getElementById('dl-csv'),
};

let result = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(busy) {
  buttons.page.disabled = busy;
  buttons.all.disabled = busy;
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function download(text, mime, ext) {
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = `apollo-scrape-${date}.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const downloadJson = () => result && download(JSON.stringify(result, null, 2), 'application/json', 'json');
const downloadCsv = () => result && download(peopleToCsv(result.people), 'text/csv', 'csv');

// Copy the JSON payload for pasting into Sponsor Engine's /triage page.
async function copyJson() {
  if (!result) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setStatus(`Copied ${result.count} people - paste into Sponsor Engine → Triage.`);
  } catch (err) {
    setStatus(`Copy failed: ${err}`);
  }
}

function finish(r, { autoDownload }) {
  result = r;
  downloadsEl.style.display = 'block';
  setBusy(false);
  setStatus(`Done: ${r.count} people from ${r.pagesScraped} page(s).`);
  if (autoDownload) {
    downloadJson();
    downloadCsv();
  }
}

async function start(allPages) {
  const tabId = await activeTabId();
  if (!tabId) return setStatus('No active tab.');
  setBusy(true);
  setStatus(allPages ? 'Scraping all pages…' : 'Scraping…');
  try {
    const ack = await chrome.tabs.sendMessage(tabId, { type: 'APOLLO_SCRAPE_START', allPages });
    if (!ack?.ok) {
      setBusy(false);
      setStatus(ack?.error || 'Could not start.');
    }
  } catch {
    setBusy(false);
    setStatus('Not an Apollo people page? Open app.apollo.io/#/people and reload the tab.');
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'APOLLO_SCRAPE_PROGRESS') {
    setStatus(
      msg.phase === 'rewinding'
        ? 'Rewinding to page 1…'
        : `Page ${msg.page}: ${msg.count} people so far…`
    );
  } else if (msg.type === 'APOLLO_SCRAPE_DONE') {
    finish(msg.result, { autoDownload: true });
  } else if (msg.type === 'APOLLO_SCRAPE_ERROR') {
    setBusy(false);
    setStatus(`Error: ${msg.message}`);
  }
});

buttons.page.addEventListener('click', () => start(false));
buttons.all.addEventListener('click', () => start(true));
buttons.copy.addEventListener('click', copyJson);
buttons.json.addEventListener('click', downloadJson);
buttons.csv.addEventListener('click', downloadCsv);

// On open, recover state: a scrape may be running or already finished.
(async () => {
  const tabId = await activeTabId();
  if (!tabId) return;
  try {
    const state = await chrome.tabs.sendMessage(tabId, { type: 'APOLLO_SCRAPE_GET_LAST' });
    if (state?.running) {
      setBusy(true);
      setStatus('Scrape in progress…');
    } else if (state?.result) {
      finish(state.result, { autoDownload: false });
      setStatus(`Last result: ${state.result.count} people from ${state.result.pagesScraped} page(s).`);
    }
  } catch {
    // Content script not present (not an Apollo tab) - leave the default UI.
  }
})();
