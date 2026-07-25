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

## What's in it

- **Pipeline** - deals move through outreach, conversation, pitched, negotiating, committed, fulfilling, renewed, lapsed, and rejected.
- **Prospects** - a scored pool of companies with weighted fit signals, bulk import, and dedupe.
- **Cadences** - assign a follow-up sequence to a deal; next actions are generated as you log touchpoints.
- **Compose** - templated emails with merge fields that pull live values from the deal, company, and settings.
- **Tiers and add-ons** - configurable sponsorship packages with per-tier deliverable checklists.
- **Fulfillment** - track what was promised against what was delivered.
- **Revenue and reporting** - committed versus weighted pipeline against a cycle goal, plus a printable, board-safe status report that excludes contact details.
- **Cycles** - annual rollover that carries warm relationships into the next cycle.
- **Discord bot** (optional) - slash commands, a daily digest of what is due, and a weekly scoreboard.

## Discord bot

The bot in `discord-bot/` is a separate package with its own install and lockfile.
Copy `discord-bot/.env.example` to `discord-bot/.env` and set `DISCORD_BOT_TOKEN`.

```bash
npm -C discord-bot install && npm -C discord-bot run bot
```

Without a token it prints full setup instructions and exits cleanly; the web app never requires it.
The **Discord** page in the app shows the same walkthrough plus live connection status.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run seed` | Idempotent demo seed |
| `npm run create-user` | Provision a login |
| `npm run reset-prospects` | Clear the prospect pool |
| `npm run backup` | Online DB backup with 7-copy rotation |
| `npm run test` | Vitest |
| `npm run lint` | ESLint |

## Adapting it to your org

Most branding lives in settings rather than code, but a few things are worth editing directly:

- `app/globals.css` - the whole theme reads from custom properties at the top of the file.
- `lib/data.ts` - `SIGNAL_CATALOG` defines the fit signals you score prospects on, and `PERSONALIZATION_HOOKS` maps each one to outreach copy.
- `app/prospects/sources.ts` - `SOURCE_CATALOG` lists where prospects come from.
- `lib/contact-backfill.ts` - `ALUMNI_PATTERN` should match how your contacts refer to your school.

## License

MIT
