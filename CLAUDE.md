# Sponsor Engine agent instructions

Sponsor Engine is a local-first CRM for student organizations that raise
corporate sponsorship (Next.js 16, React 19, Drizzle, SQLite/libSQL).

## Dev workflow

- `npm run dev` runs the Next.js dev server at http://localhost:3000.
- `npm run seed` fills the database with fictional demo data. It is idempotent -
  it no-ops if any company already exists, so it's safe to run repeatedly.
- Data lives in `data/sponsortrack.db` (SQLite, gitignored) unless `turso_url` /
  `turso_auth_token` are set in `.env.local`, in which case it talks to hosted
  libSQL/Turso instead. Either way the schema auto-migrates on first run - there
  is no separate migration command.
- `npm run lint` (ESLint) and `npm run test` (Vitest) before calling anything done.
- `discord-bot/` is a separate optional package with its own install/lockfile;
  it is not required to run or test the web app.

## Git and GitHub

- Use git worktrees for development. Never edit directly on the main checkout;
  create a worktree (or isolated branch) per piece of work and merge it back.
- Commit messages: plain, no agent co-author lines.

## Private data companion (optional)

Orgs using this app for agent-driven prospect research often keep a **private
sibling repository** for research docs, sourcing playbooks, and scraped/researched
findings - none of that belongs in this public repo. The convention, if you set
one up:

```
your-org/
  sponsor-engine/        # this repo (public)
  sponsor-engine-data/   # private sibling, your org's research + findings
```

Generic findings importers (if you build them) read JSON from the sibling data
repo and write through this app's own data layer (`lib/db.ts`, `lib/data.ts`,
`lib/schema.ts`). The app's database remains the single source of truth; the data
repo is just staging.

**Never commit real contact data, scraped PII, or org-specific research to this
public repo.** That includes real company/sponsor names tied to a specific
outreach campaign, real people's names/emails/LinkedIn URLs, and anything that
identifies your organization beyond generic product usage. Keep that in the
private sibling repo instead.
