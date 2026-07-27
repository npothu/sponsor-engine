// CSV serialization for scrape results - same fields as the JSON.

const CSV_FIELDS = ['name', 'apolloId', 'title', 'company', 'linkedin'];

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called from popup.js; shared as a plain global (popup.html loads csv.js before popup.js)
function peopleToCsv(people) {
  const lines = [CSV_FIELDS.join(',')];
  for (const p of people) {
    lines.push(CSV_FIELDS.map((f) => csvEscape(p[f])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
