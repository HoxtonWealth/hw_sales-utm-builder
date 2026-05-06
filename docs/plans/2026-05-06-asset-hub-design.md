# Asset Hub — Design

**Date:** 2026-05-06
**Status:** Design validated, ready for implementation planning

## Goal

Give sales reps a single place to find PDF collateral (tax checklists, pension guides, compliance docs, etc.). Admins curate the library; reps browse, filter by tag, and either download internal-only assets or copy a UTM-tracked short link for client-facing assets.

## Scope

**In scope**
- New Supabase table `assets` storing PDF URL + metadata (no file uploads — URLs only).
- Admin CRUD page at `/admin/assets` (gated by existing `admin_session` cookie).
- Public read-only browse page at `/asset-hub` (added to global `Nav`).
- Tag-based filtering with multi-select AND semantics + title search.
- Per-asset `shareable` flag — true assets get a "Copy tracked link" button that builds UTMs + sc_id and shortens via the existing `/api/shorten` route; false assets only get a "Download" button.
- Channel toggle (linkedin/email) and rep picker on `/asset-hub`, mirroring the main UTM page.

**Out of scope**
- File uploads / Supabase Storage integration. Files stay on their existing CDNs (datocms etc.).
- Thumbnails or PDF previews.
- Download analytics in our DB — Short.io and existing analytics already capture link clicks.
- Soft-delete or version history.
- Bulk import UI — initial seed is a one-off script.
- Cron / background sync — purely admin-curated.

## Architecture

### New files
- `scripts/migrations/003_assets.sql` — table + indexes (run manually in Supabase SQL editor).
- `src/lib/assets.ts` — `getAssets`, `createAsset`, `updateAsset`, `deleteAsset` helpers.
- `src/app/api/assets/route.ts` — public `GET` (force-dynamic), returns full list.
- `src/app/api/admin/assets/route.ts` — `GET` list, `POST` create, `PUT` update, `DELETE` remove (all auth, id-in-body for PUT/DELETE — matches the existing `google-alert-feeds` pattern).
- `src/app/admin/assets/page.tsx` — admin form + table.
- `src/app/asset-hub/page.tsx` — rep-facing card grid + filters.

### Touched files
- `src/components/Nav.tsx` — add "Asset Hub" link.
- `src/app/admin/page.tsx` — add "Manage assets" link in admin home.
- `CLAUDE.md` — document new routes, table, and migration.

### Reused infrastructure
- `src/lib/auth.ts` — `isAuthenticated()` for admin routes.
- `src/lib/supabase.ts` — service-role client (with `uncachedFetch` wrapper to avoid the Next.js data-cache leak documented in memory).
- `src/app/api/shorten/route.ts` — existing Short.io wrapper for "Copy tracked link".
- Searchable rep dropdown from main page — extract into `src/components/RepPicker.tsx` if not already shared, then reuse on `/asset-hub`.

## Data model

```sql
create table assets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  url         text not null,                  -- direct PDF URL on external CDN
  description text,
  tags        text[] not null default '{}',
  shareable   boolean not null default false, -- true = client-facing, gets UTM/short link
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index assets_tags_idx       on assets using gin (tags);
create index assets_created_at_idx on assets (created_at desc);
```

Notes:
- `tags` as Postgres `text[]` with GIN index — fast `WHERE 'tax' = ANY(tags)`, no join table.
- `updated_at` is set by the API route on `PUT` (no DB trigger needed; matches existing patterns).
- RLS stays disabled — same posture as `mentions` and other tables (server uses service-role key).
- Migration follows the `001_mentions.sql` pattern: a manual SQL file the user runs in the Supabase dashboard.

## Admin UI (`/admin/assets`)

Single page, two areas. Auth: `admin_session` cookie (redirect to `/admin` if missing).

**Add new asset form (top)**
- Title (text, required)
- URL (text, required, simple URL validation)
- Description (textarea, optional, ~120 char hint)
- Tags (text input, splits on comma → `text[]`)
- Shareable (checkbox: "Reps can share this with clients")
- Submit → `POST /api/admin/assets`, clears form on success, refreshes table.

**Existing assets table (below)**
- Columns: Title, Tags (chips), Shareable (badge), Created, Actions.
- Sort: `created_at desc`.
- Actions per row:
  - **Edit** — opens the same form prefilled (modal or inline expand). Saves via `PUT /api/admin/assets/:id`.
  - **Delete** — confirm prompt, then `DELETE /api/admin/assets/:id`.
- Optional tag-filter dropdown above the table for fast lookup once the library grows.

## Rep-facing UI (`/asset-hub`)

Public route. Linked from `src/components/Nav.tsx`.

**Top controls**
- Channel toggle (linkedin / email) — drives `utm_source` + `utm_medium`. Same component as the main UTM page.
- Searchable rep picker — sticky in `localStorage` so reps only choose themselves once. Required before "Copy tracked link" can fire.
- Title search box (client-side, debounced).
- Tag filter chips — derived from the union of all tags in the dataset; click to toggle, AND semantics across multiple selections.

**Card grid (3-col desktop, 1-col mobile)**
- Title (bold) + Description (muted, 1–2 lines) + Tag chips (read-only but clickable to filter).
- Action area depends on `shareable`:
  - `shareable: true` → primary **Copy tracked link** button + secondary **Download** button.
  - `shareable: false` → only **Download** button.

**Copy tracked link flow**
1. Rep clicks the button.
2. Client builds the UTM-tagged URL on top of `asset.url`:
   - `utm_source`, `utm_medium` from channel toggle.
   - `utm_campaign` = slugified rep name.
   - `utm_content` = slugified asset title.
   - `sc_id` = rep's sc_id (or default).
3. `POST /api/shorten` with the tagged URL.
4. Copy returned short URL to clipboard, show "Copied!" toast.

**Download flow** — opens `asset.url` directly in a new tab. No tracking, no API call.

**Empty state** — "No assets match your filters" when search/tag combo yields nothing.

## API contract

| Method | Route                              | Auth  | Body                                                                 | Returns               |
|--------|------------------------------------|-------|----------------------------------------------------------------------|-----------------------|
| GET    | `/api/assets`                      | none  | —                                                                    | `{ assets: Asset[] }` |
| GET    | `/api/admin/assets`                | admin | —                                                                    | `{ assets: Asset[] }` |
| POST   | `/api/admin/assets`                | admin | `{ title, url, description?, tags: string[], shareable: boolean }`   | `{ asset: Asset }`    |
| PUT    | `/api/admin/assets`                | admin | `{ id, title?, url?, description?, tags?, shareable? }`              | `{ asset: Asset }`    |
| DELETE | `/api/admin/assets`                | admin | `{ id }`                                                             | `{ success: true }`   |

All `GET` routes export `dynamic = "force-dynamic"`.
All admin routes call `isAuthenticated()` first; return 401 otherwise.

## Test plan

Manual smoke (no automated test infra in this repo):
1. Run migration `003_assets.sql` in Supabase SQL editor.
2. Visit `/admin/assets`, add the seed list of PDFs (user will provide URL + tag list).
3. Edit an asset — change title, add a tag, toggle `shareable`. Verify changes persist.
4. Delete an asset. Verify it disappears from `/asset-hub`.
5. Visit `/asset-hub`:
   - Pick a rep, set channel to `linkedin`.
   - Click "Copy tracked link" on a `shareable: true` asset → confirm clipboard contains a Short.io URL with the right UTMs and `sc_id`.
   - Click "Download" on a `shareable: false` asset → confirm the raw PDF opens.
   - Filter by a tag → confirm grid narrows.
   - Combine title search + tag filter → confirm AND semantics.
6. Verify `/asset-hub` is reachable from the global `Nav` and `/admin/assets` is reachable from `/admin`.

## Open follow-ups (not blocking)

- If the library grows beyond ~200 assets, add server-side pagination on `/api/assets`.
- If reps want to share via channels other than linkedin/email, expand the channel toggle.
- If admin overhead grows, add a CSV bulk import on `/admin/assets`.
