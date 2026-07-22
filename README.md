# AURA — Men's Apparel E-commerce (Lebanon)

AURA is a bilingual (English / Arabic-RTL) men's clothing storefront with a full
admin console, built for the Lebanese market (nationwide delivery, cash on
delivery). Live at **https://aura-lb.shop**.

## Tech stack

```
React + Vite SPA  ──fetch──▶  Express API  ──▶  SQLite (better-sqlite3)
   (src/)                       (server/)          (data.db)
```

- **Frontend** — React 18, Vite 6, TailwindCSS, Radix UI, react-router-dom v6,
  @tanstack/react-query (`src/`).
- **Backend** — Node + Express (`server/`), better-sqlite3 storage. One process
  serves the built SPA from `dist/`, the REST API under `/api/*`, and uploaded
  files from `/uploads`.
- **Deploy** — Railway (see `railway.json`; build `npm run build`, start
  `npm start`). Mount a persistent volume at `/data` and set
  `MINIYO_DB_PATH=/data/data.db` so the database survives redeploys.
- **Images** — Cloudflare R2 when the `R2_*` vars are set (WebP via sharp);
  otherwise uploads fall back to local disk.
- **Email** — Resend when `RESEND_API_KEY` is set; otherwise emails are logged
  to the `EmailLog` table.

## Quick start

```bash
npm install
cp .env.example .env   # then fill in your values (all optional for local dev)
npm run dev:server     # Express API on :4000
npm run dev            # Vite on :5173, proxies /api and /uploads to :4000
```

Open <http://localhost:5173>.

### Production

```bash
npm run build          # build the SPA into dist/
npm start              # node server/index.js on $PORT (default 4000)
```

`npm run serve` does both in one command. Other scripts: `npm test`
(`node --test server/`), `npm run lint`, `npm run typecheck`.

## Environment variables

Copy `.env.example` to `.env` for local dev, or set these in Railway →
Variables. Never commit a real `.env`. Highlights (see `.env.example` for the
full list):

| Variable | Purpose |
|---|---|
| `PORT` | Server port (Railway injects it — leave unset there) |
| `MINIYO_DB_PATH` | SQLite file location, e.g. `/data/data.db` on a Railway volume |
| `MINIYO_JWT_SECRET` | Session-signing secret — **required in production** |
| `AURA_ADMIN_PASSWORD` | Password for the seeded super admin (see below) |
| `AURA_SUPER_ADMIN_EMAILS` | Comma-separated emails promoted to `super_admin` on every boot |
| `RESEND_API_KEY` / `MINIYO_EMAIL_FROM` | Transactional email via Resend |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | Cloudflare R2 image storage. Set `R2_PUBLIC_BASE_URL=https://image.aura-lb.shop` — on boot the server rewrites any legacy `r2.dev` image URLs stored in the DB to this host (see `server/rewriteImageHost.js`) |
| `AURA_META_PIXEL_ID` / `AURA_META_CAPI_ACCESS_TOKEN` | Meta Pixel + Conversions API (see `docs/META_TRACKING.md`) |
| `VITE_TIKTOK_PIXEL_ID` / `AURA_TIKTOK_PIXEL_ID` / `AURA_TIKTOK_ACCESS_TOKEN` | TikTok Pixel + Events API (see `docs/TIKTOK_TRACKING.md`) |

## Admin seeding

On first boot the server seeds the catalog, shipping zones, settings, CMS
content, and the super-admin account `admin@aura.store`. The admin password is
read from `AURA_ADMIN_PASSWORD` (falling back to `MINIYO_ADMIN_PASSWORD`). In
production, if neither is set, admin seeding is skipped with a warning — no
default password is ever used outside local development. Change the password
after first login, and rotate it immediately if it was ever exposed.

## Project layout

```
server/
  index.js       Express app + routes + SPA serving
  db.js          SQLite generic entity store
  auth.js        JWT cookie sessions + bcrypt
  email.js       Resend / EmailLog fallback
  functions.js   backend functions (/api/functions/:name)
  seed.js        idempotent seed (admin, settings, zones, catalog, CMS)
src/
  api/base44Client.js   standalone API client
```

## Security

See `SECURITY.md`: never commit secrets; gitleaks runs in CI
(`.github/workflows/secret-scan.yml`) and via an optional pre-commit hook.
