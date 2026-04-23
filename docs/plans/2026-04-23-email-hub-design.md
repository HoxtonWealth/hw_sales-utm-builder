# Email Hub — Design

**Date:** 2026-04-23
**Status:** Design validated, ready for implementation planning

## Goal

Mirror the Content Hub experience for marketing emails sent via Ortto. Reps land on `/email-hub`, browse recently-sent emails as cards, and open a modal to preview the rendered HTML, copy subject/preview/HTML, or download the `.html` file.

## Scope

**In scope**
- Daily cron that pulls sent marketing emails from Ortto (EU region) into Supabase.
- Keyword-based ingest filter on campaign name (configurable via env var).
- A/B variant support (two rows per split campaign, badged A/B in the UI).
- Card grid on `/email-hub` with filter tabs derived from campaign-name prefix.
- Modal with inline iframe preview + copy/download actions.
- Dedicated full-width preview route `/email-hub/[id]`.
- 30-day retention with auto-purge in the cron.

**Out of scope**
- UTM / tracked-link builder on email cards (reps use the main builder page for that).
- AI rewriter on email cards.
- Admin UI for the keyword filter (env var only).
- Manual "re-sync" button.
- Search within emails.

## Architecture

### New files
- `src/app/api/cron/scrape-ortto/route.ts` — daily cron, 07:00 UTC.
- `src/lib/ortto.ts` — Ortto API client + helpers (keyword filter, A/B flatten, first-image extractor).
- `src/app/api/emails/route.ts` — GET returns `{ emails, lastSynced }`.
- `src/app/email-hub/page.tsx` — card grid + modal.
- `src/app/email-hub/[id]/page.tsx` — full-width preview route (server component).

### Reused infrastructure
- Supabase client (`src/lib/supabase.ts`) with its `uncachedFetch` wrapper.
- `post-images` storage bucket (new `email/` folder for thumbnails).
- `scrape_log` table (new `source: "ortto"` rows).
- `CRON_SECRET` auth pattern.

### Daily cron flow
1. Call `POST /v1/campaign/calendar` with a 7-day window in the configured timezone (recovers missed runs).
2. Filter: `type === "email"` AND `state === "sent"` AND name contains any keyword in `ORTTO_EMAIL_NAME_INCLUDES` (case-insensitive).
3. Flatten A/B variants: campaigns with `a_b_testing.variant_a_asset_id` + `variant_b_asset_id` produce two rows.
4. For each `asset_id` not already in `emails` (unique index = free dedupe): call `POST /v1/assets/get-html`, extract first usable `<img>` (skip width/height < 100 and `display:none`), download the image to Supabase storage, insert the row.
5. Rate-limit to 10 req/s (Ortto Professional plan floor) with a small sleep. On 429 honor `try-in-seconds`, retry once; second 429 = skip + log.
6. Append one `scrape_log` row with `source: "ortto"`, `items_added`, `metadata.errors`.
7. Purge: `DELETE FROM emails WHERE sent_at < now() - interval '30 days'`.

## Data model

### New `emails` table
```sql
create table public.emails (
  id           uuid primary key default gen_random_uuid(),
  asset_id     text not null unique,
  campaign_id  text not null,
  variant      text,                    -- null | 'a' | 'b'
  name         text not null,
  subject      text,
  preview      text,
  from_name    text,
  from_email   text,
  reply_to     text,
  body_html    text not null,
  image_url    text,
  sent_at      timestamptz not null,
  created_at   timestamptz not null default now()
);

create index emails_sent_at_idx on public.emails (sent_at desc);
```
RLS disabled (matches existing tables in this project).

### Env vars
| Variable | Value |
|---|---|
| `ORTTO_API_KEY` | Private API key from Ortto CDP > Data sources > Custom API |
| `ORTTO_BASE_URL` | `https://api.eu.ap3api.com` (default; env override allowed) |
| `ORTTO_EMAIL_NAME_INCLUDES` | Comma-separated keywords, case-insensitive, any match wins |
| `ORTTO_TIMEZONE` | Timezone for the calendar query; default `Europe/London` |

## UI

### Page shell
Identical to Content Hub: `bg-stone-50`, centered `max-w-7xl`, title + "Last synced" header, 5/4/3/2/1-column responsive grid.

### Filter tabs
Derived from campaign-name prefix before ` — ` or ` - ` (e.g. "Daily Sparkle — Spain pensions" → "Daily Sparkle" tab). "All" first, then distinct prefixes alphabetically. Emails without a detectable prefix appear under "All" only.

### Card
- 4:3 image slot: `image_url` if set, else styled fallback (envelope SVG on indigo-50→indigo-100 gradient).
- Pill: "Email" in indigo-100/indigo-700.
- Title: `subject` (line-clamp-1, bold).
- Body: `preview` (line-clamp-2, stone-500).
- Footer: `sent_at` date + `Copy subject` (secondary) + `Open` (primary dark).
- A/B badge (`A` or `B`) in the top-right of the image slot when `variant` is set.

### Modal (`max-w-lg`)
Header: thumbnail + pill + subject + from_name + sent_at.

Stacked actions:
1. Inline preview iframe — `srcdoc={body_html}`, `sandbox="allow-same-origin"`, 100% width, ~400px height, rounded border.
2. `Open full preview ↗` — opens `/email-hub/[id]` in a new tab.
3. `Download HTML` — saves `{slugified-subject}.html` via the existing blob-download helper.
4. `Copy subject` / `Copy preview` / `Copy HTML` — three buttons with the "Copied!" 2s-reset pattern.

### Full-preview route
Server component at `/email-hub/[id]/page.tsx`: fetch row by id, render `<div dangerouslySetInnerHTML={{ __html: body_html }} />` inside a centered 600px column on a blank white page. No app chrome.

## API

```
GET /api/emails  →  { emails: Email[], lastSynced: string | null }
```
`dynamic = "force-dynamic"` + `Cache-Control: no-store`. `lastSynced` reads the latest `scrape_log` row where `source = 'ortto'` (not the overall latest, so a blog run doesn't mis-stamp emails).

## Error handling

- **Missing env vars** — log, write `scrape_log` error row, return 200 (no retry storm).
- **Ortto 429** — read `try-in-seconds`, sleep, retry once. Second 429 = skip asset, log, continue.
- **Ortto 4xx/5xx on `/get-html`** — skip asset, log, continue.
- **Image extraction fails / image 404** — insert row with `image_url: null`; card renders the fallback tile.
- **Invalid `sent_at` string** — fall back to `now()`, log warning.
- **Partial runs** — `asset_id` unique index makes cron idempotent; re-running picks up where it left off.

## Manual test plan

1. Set `ORTTO_*` env vars in `.env.local`, trigger cron: `curl "localhost:3000/api/cron/scrape-ortto?secret=$CRON_SECRET"`.
2. Verify rows in `emails`, new `scrape_log` row with `source = 'ortto'`, thumbnails in `post-images/email/`.
3. Visit `/email-hub`: cards render, filter tabs work, thumbnail and fallback tile both appear correctly.
4. Open modal: iframe renders the email; Copy subject / Copy preview / Copy HTML / Download all work; Open full preview opens the clean route.
5. Re-run cron: zero new rows (dedupe works).
6. Backdate a row to > 30 days, re-run: row is purged.

## Gotchas captured from the Ortto docs

- Asset Manager only — emails built via Campaigns nav have no usable `asset_id` and will be silently skipped.
- A/B variants replace `asset_id` with two variant-specific IDs — must be flattened.
- Rate limits (Professional: 10 req/s); handle 429 with `try-in-seconds`.
- Region-specific base URL; this project uses EU.
