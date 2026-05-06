# UTM Builder

Internal tool for Hoxton Wealth sales reps to generate tracked UTM links.

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Database:** Upstash Redis via `@vercel/kv` (two keys: `reps`, `default_sc_id`)
- **Styling:** Tailwind CSS
- **Hosting:** Vercel (auto-deploys from GitHub)
- **Auth:** Single admin password via `ADMIN_PASSWORD` env var + httpOnly cookie

## Project Structure

```
src/
  lib/
    types.ts          # Rep type: { name: string; sc_id: string | null }
    kv.ts             # Vercel KV helpers (getReps, saveReps, getDefaultScId, saveDefaultScId)
    auth.ts           # isAuthenticated() - checks admin_session cookie
  app/
    page.tsx                     # Public builder page - searchable rep dropdown, channel toggle, UTM generation
    admin/page.tsx               # Password-protected admin - manage reps + default SC_ID
    admin/mentions/page.tsx      # Hidden admin page - press/media mentions list + Google Alert feeds CRUD
    admin/assets/page.tsx        # Admin CRUD for the Asset Hub (PDFs by URL + tags + shareable flag)
    asset-hub/page.tsx           # Public Asset Hub - searchable/tagged PDF library, tracked share links
    api/
      auth/route.ts              # POST login, DELETE logout
      reps/route.ts              # GET (public), POST/PUT/DELETE (auth required)
      settings/route.ts          # GET (public), PUT (auth required)
      shorten/route.ts           # POST - shortens a URL via Short.io API
      assets/route.ts            # GET (public) - list assets for /asset-hub
      cron/fetch-mentions/route.ts        # Daily cron - pulls Coveragebook + Google Alerts into mentions table
      admin/mentions/route.ts             # GET list of mentions (admin auth)
      admin/mentions/run/route.ts         # POST trigger fetch synchronously (admin auth)
      admin/google-alert-feeds/route.ts   # GET/POST/PUT/DELETE feeds (admin auth)
      admin/assets/route.ts               # GET/POST/PUT/DELETE assets (admin auth, id-in-body for PUT/DELETE)
scripts/
  seed.ts                  # Seeds 196 reps into KV (run with `npm run seed`)
  migrations/              # Manual SQL migrations to run in Supabase dashboard
    001_mentions.sql         # mentions + google_alert_feeds tables
    003_assets.sql           # assets table for Asset Hub
```

## Environment Variables

| Variable | Source |
|---|---|
| `KV_REST_API_URL` | Auto-set by Vercel (Upstash Redis integration) |
| `KV_REST_API_TOKEN` | Auto-set by Vercel (Upstash Redis integration) |
| `ADMIN_PASSWORD` | Set manually in Vercel env vars |
| `SHORT_IO_API_KEY` | Set manually in Vercel env vars |
| `SHORT_IO_DOMAIN` | Set manually in Vercel env vars |
| `ORTTO_API_KEY` | Set manually in Vercel env vars (Ortto CDP > Data sources > Custom API) |
| `ORTTO_BASE_URL` | Optional override; defaults to `https://api.eu.ap3api.com` |
| `ORTTO_EMAIL_NAME_INCLUDES` | Comma-separated keywords; only campaign names containing one match get ingested |
| `ORTTO_TIMEZONE` | Optional override; defaults to `Europe/London` |
| `CRON_SECRET` | Set manually; gates all `/api/cron/*` routes (passed as `?secret=`) |
| `FIRECRAWL_API_KEY` | Set manually; for Coveragebook scrape via Firecrawl |
| `COVERAGEBOOK_SHARE_URL` | Set manually; the Coveragebook share-link URL Firecrawl scrapes |

## Key Commands

- `npm run dev` - local development
- `npm run seed` - load reps into KV (reads `.env.local`)
- `npm run build` - production build

## UTM Parameter Mapping

| Parameter | Value | Source |
|---|---|---|
| utm_source | `linkedin` or `email` | Channel toggle |
| utm_medium | `social` or `email` | Auto-mapped from channel |
| utm_campaign | Rep name slugified | e.g. "john-doe" |
| utm_content | Last URL path segment | e.g. "ai-marketing-101" |
| sc_id | Rep's SC_ID or default | From KV store |

## Important Notes

- All API GET routes use `dynamic = "force-dynamic"` to prevent Next.js caching
- The KV store name on Vercel is `upstash-kv-amber-bucket`
- Admin cookie: `admin_session` (httpOnly, secure in prod, sameSite strict, 24h expiry)
- Rep names are always sorted alphabetically in KV
- URL shortening uses Short.io API (POST /api/shorten) — no auth required, calls Short.io server-side
- Mentions feature is **hidden** — only linked from the authenticated `/admin` page. No public route.
- Mentions retention: 90 days, enforced by `pruneOldMentions()` in `src/lib/mentions.ts` (two-pass: by `published_at`, falls back to `created_at` when null)
- `mentions` and `google_alert_feeds` tables must be created in Supabase before deploy — run `scripts/migrations/001_mentions.sql` in the Supabase SQL editor
- The fetch-mentions cron runs daily at 02:00 UTC; admins can also trigger it via "Run now" on `/admin/mentions`
- Asset Hub stores **only URLs** to PDFs hosted elsewhere (e.g. datocms). No file uploads. The `assets` table must be created via `scripts/migrations/003_assets.sql` before deploy.
- Asset Hub admin CRUD lives at `/admin/assets`; public browse at `/asset-hub` (linked from the global Nav).
