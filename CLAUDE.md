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
    page.tsx           # Public builder page - searchable rep dropdown, channel toggle, UTM generation
    admin/page.tsx     # Password-protected admin - manage reps + default SC_ID
    api/
      auth/route.ts    # POST login, DELETE logout
      reps/route.ts    # GET (public), POST/PUT/DELETE (auth required)
      settings/route.ts # GET (public), PUT (auth required)
scripts/
  seed.ts              # Seeds 196 reps into KV (run with `npm run seed`)
```

## Environment Variables

| Variable | Source |
|---|---|
| `KV_REST_API_URL` | Auto-set by Vercel (Upstash Redis integration) |
| `KV_REST_API_TOKEN` | Auto-set by Vercel (Upstash Redis integration) |
| `ADMIN_PASSWORD` | Set manually in Vercel env vars |

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
