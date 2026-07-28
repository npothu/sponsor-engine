# Sponsor Engine

A local-first CRM for student organizations that raise corporate sponsorship.
Track companies and contacts, move deals through a pipeline, run outreach cadences, compose templated emails, and report what you closed.

Built with Next.js 16, React 19, Drizzle, and SQLite (or hosted libSQL/Turso).

## Quickstart

```bash
npm install
```

```bash
npm run seed
```

```bash
npm run dev
```

The app runs at http://localhost:3000.
`npm run seed` fills a fresh database with fictional demo data so there is something to click through.

Set your organization's name, your name, and revenue goals under **Settings -> General**.
Those values feed the merge fields used in outreach templates and proposals.

## Database

Data lives in `data/sponsortrack.db` (SQLite, gitignored).
The file is created and migrated automatically on first run, so there is no separate migration command.

To use hosted libSQL instead, copy `.env.example` to `.env.local` and set `turso_url` and `turso_auth_token`.
Leaving both unset keeps everything local.

## Authentication

There is no public signup route.
Create accounts from the CLI:

```bash
npm run create-user -- --email you@example.com --name "Your Name" --role admin
```

The command prints a generated password once and stores only a bcrypt hash.
Set `AUTH_SECRET` in `.env.local` before first login (`npx auth secret` generates one).

## Deploy your own (Vercel + Turso)

The hosted setup is one database and three environment variables:

1. **Fork this repo** (forking rather than cloning keeps updates easy - see [Staying up to date](#staying-up-to-date)).
2. **Create a database** with the [Turso CLI](https://docs.turso.tech/cli):

   ```bash
   turso db create sponsor-engine && turso db show sponsor-engine --url && turso db tokens create sponsor-engine
   ```

3. **Import the fork at [vercel.com/new](https://vercel.com/new)** and set three environment variables: `turso_url` and `turso_auth_token` from step 2, and `AUTH_SECRET` (generate with `npx auth secret`). Deploy.
   There is no migration step - the schema creates and migrates itself on first request.
4. **Create your login**: clone your fork locally, put the same three variables in `.env.local`, and run the `create-user` command from [Authentication](#authentication).
5. **Make it yours in the app**: set your org's name and goals under **Settings -> General**, then tiers, templates, and cadences.
   Skip `npm run seed` here - it writes fictional demo data, which you don't want in a real deployment.

No Vercel or Turso account? Everything also runs fully local with zero configuration - that's the Quickstart above.

## What's in it

- **Pipeline** - deals move through outreach, conversation, pitched, negotiating, committed, fulfilling, renewed, lapsed, and rejected.
- **Prospects** - a scored pool of companies with weighted fit signals, bulk import, and dedupe.
- **Contact triage** - paste in a scraped batch of contacts (see the Apollo scraper below), keep or reject each one before it enters the tracker, and optionally fire off a LinkedIn cadence on keep.
- **Cadences** - assign a follow-up sequence to a deal; next actions are generated as you log touchpoints.
- **Compose** - templated emails with merge fields that pull live values from the deal, company, and settings.
- **Tiers and add-ons** - configurable sponsorship packages with per-tier deliverable checklists.
- **Fulfillment** - track what was promised against what was delivered.
- **Revenue and reporting** - committed versus weighted pipeline against a cycle goal, plus a printable, board-safe status report that excludes contact details.
- **Cycles** - annual rollover that carries warm relationships into the next cycle.
- **Audit log** - every change is attributed to the user (or script) that made it; admins can review the full history under Settings -> Audit Log.
- **Discord bot** (optional) - slash commands, a daily digest of what is due, a weekly scoreboard, and an app-side pause switch.

## Discord bot

The bot in `discord-bot/` is a separate package with its own install and lockfile.
Copy `discord-bot/.env.example` to `discord-bot/.env` and set `DISCORD_BOT_TOKEN`.

```bash
npm -C discord-bot install && npm -C discord-bot run bot
```

Without a token it prints full setup instructions and exits cleanly; the web app never requires it.
The **Discord** page in the app shows the same walkthrough plus live connection status (via a periodic heartbeat) and a pause switch that stops the bot from acting without taking it offline.

By default, mutations from the bot (`/log`, `/prospect`) are attributed to no one in the audit log.
Link a Discord account to a login with `npm run link-discord-user` so those show up under a real person instead.

## Contact sourcing tools

`tools/apollo-scraper-extension/` is a small Chrome extension that scrapes visible names, titles, and companies from an Apollo.io search results page (no export credits spent) into JSON/CSV.
`scripts/apollo-scrape-snippet.js` is the same idea as a paste-into-devtools console snippet, for a one-off scrape without installing the extension.
Paste either output into **Triage** to keep or reject each contact before it enters the tracker.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run seed` | Idempotent demo seed |
| `npm run create-user` | Provision a login |
| `npm run link-discord-user` | Link a login to a Discord account for bot attribution |
| `npm run reset-prospects` | Clear the prospect pool |
| `node scripts/purge-contacts.mjs [--commit]` | Back up and bulk-clear the `contacts` table (dry run by default) |
| `npm run backup` | Online DB backup with 7-copy rotation |
| `npm run test` | Vitest |
| `npm run lint` | ESLint |

## Adapting it to your org

Most branding lives in settings rather than code, but a few things are worth editing directly:

- `app/globals.css` - the whole theme reads from custom properties at the top of the file.
- `lib/data.ts` - `SIGNAL_CATALOG` defines the fit signals you score prospects on, and `PERSONALIZATION_HOOKS` maps each one to outreach copy.
- `app/prospects/sources.ts` - `SOURCE_CATALOG` lists where prospects come from.
- `lib/contact-backfill.ts` - `ALUMNI_PATTERN` should match how your contacts refer to your school.

## Staying up to date

If you forked, updates are ordinary merges - GitHub's **Sync fork** button handles the no-conflict case, or from a local checkout:

```bash
git remote add upstream https://github.com/npothu/sponsor-engine.git
```

```bash
git fetch upstream && git merge upstream/main
```

Prefer hands-off? This repo ships `.github/workflows/upstream-sync.yml`: enable Actions on your fork (GitHub disables them until you do) and it opens an "upstream-sync" PR in your fork whenever this repo gains commits, weekly. You review and merge; nothing lands unattended.

If you created your copy with **Use this template** instead of forking, its history is unrelated to this repo's, so the *first* merge needs `git fetch upstream && git merge upstream/main --allow-unrelated-histories`. Every sync after that behaves like the fork case.

Updates stay conflict-free as long as your customizations live in **Settings and the database** rather than the source tree. If you do edit source (see [Adapting it to your org](#adapting-it-to-your-org)), keep those edits small and expect the occasional conflict in exactly those files.

## License

MIT
