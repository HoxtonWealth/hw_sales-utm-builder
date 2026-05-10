# UTM Builder

Internal tool for Hoxton Wealth sales reps to generate tracked UTM links.

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Database:** Upstash Redis via `@vercel/kv` (two keys: `reps`, `default_sc_id`)
- **Styling:** Tailwind CSS
- **Hosting:** Vercel (auto-deploys from GitHub)
- **Auth:** Single admin password via `ADMIN_PASSWORD` env var + httpOnly cookie for `/admin/*`. Clerk (`@clerk/nextjs`) for `/marketing-contact/*` only — scoped via `src/middleware.ts` matcher.

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
    marketing-contact/                                # Clerk-gated section
      layout.tsx                                       # ClerkProvider wrapper (scoped to this segment)
      page.tsx                                         # Lookup contact by Ortto/HXT/email + activity timeline
      sign-in/[[...sign-in]]/page.tsx                  # Clerk <SignIn /> (sign-up disabled — invite-only via Clerk Dashboard)
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
      marketing-contact/lookup/route.ts   # POST - resolve email/HXT/Ortto ID to contact (Clerk-protected)
      marketing-contact/activities/route.ts  # POST - paginated activities for a contact (Clerk-protected)
      marketing-contact/enrich-linkedin/start/route.ts  # POST - kick off FullEnrich reverse-email lookup
      marketing-contact/enrich-linkedin/[id]/route.ts   # GET  - poll FullEnrich, auto-save to Ortto when no conflict
      marketing-contact/enrich-linkedin/save/route.ts   # POST - explicit save (used by Replace existing button)
      marketing-contact/enrich-phone/start/route.ts     # POST - kick off FullEnrich enrich-by-LinkedIn (quota-checked)
      marketing-contact/enrich-phone/[id]/route.ts      # GET  - poll, atomically consume quota, save to phn::phone
      marketing-contact/enrich-phone/save/route.ts      # POST - explicit save (Replace existing), also quota-gated
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
| `FULLENRICH_API_KEY` | Set manually; for LinkedIn (v1 reverse-email) and phone (v2 contact-enrich) lookups on `/marketing-contact` |
| `FULLENRICH_API_BASE` | Optional override for the v1 base; defaults to `https://app.fullenrich.com/api/v1`. v2 base is hard-coded. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (Marketing Contact only) |
| `CLERK_SECRET_KEY` | Clerk secret key (Marketing Contact only) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/marketing-contact/sign-in` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/marketing-contact` |

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
- **Marketing Contact** (`/marketing-contact`) is Clerk-gated. The Clerk middleware in `src/middleware.ts` is intentionally scoped to `/marketing-contact/:path*` and `/api/marketing-contact/:path*` — so `/admin`, the other hubs, and all `/api/cron/*` routes are unaffected. `<ClerkProvider>` lives only in `src/app/marketing-contact/layout.tsx`. Sign-up allowlist is managed in the Clerk Dashboard.
- **LinkedIn enrichment** on the contact card calls FullEnrich's v1 reverse-email-lookup with the contact's email and writes the result to Ortto's `str:cm:linkedin-url`. Browser polls for up to 3 minutes; the FullEnrich `enrichmentId` is cached in `localStorage` (key `linkedin-enrich:<email>`, 24h TTL) so retries resume the same job instead of starting a new one (and burning another credit). **No daily quota.**
- **Phone enrichment** is gated on the contact already having a LinkedIn URL. Calls FullEnrich's v2 contact-enrich with `linkedin_url` + `enrich_fields: ["contact.phones"]`, normalises the result to E.164-ish form, and writes to Ortto's `phn::phone`. Same 3-minute polling and `localStorage` resume pattern (key `phone-enrich:<contactId>`).
- **Phone enrichment quota**: each Clerk user gets `PHONE_ENRICH_DAILY_LIMIT` (currently 3) successful Ortto saves per UTC calendar day. Counter lives in Vercel KV (`phone-enrich-quota:<userId>:<YYYY-MM-DD>`, 48h TTL). Atomic `INCR` with rollback on Ortto failure; refused at the start route to avoid burning a FullEnrich credit when over cap. Limit constant: `src/lib/marketing-contact/quota.ts`.
- **Ortto person/merge shape** for both writes: place the merge key inside `fields`, e.g. `{ people: [{ fields: { "str::person_id": "<id>", "str:cm:linkedin-url": "..." } }], merge_by: ["str::person_id"], merge_strategy: 2, find_strategy: 1, async: false }`. The endpoint will silently mistype top-level `id` as a date field and return a 400 if you nest it wrong.
