# UTM Builder

Internal tool for sales reps to generate tracked UTM links for LinkedIn and email outreach.

## Setup

1. Clone the repo
2. Deploy to Vercel (import from GitHub at vercel.com)
3. Create a KV store: Vercel dashboard → your project → Storage → KV → Create (it auto-links env vars)
4. Add `ADMIN_PASSWORD` env var in Vercel → Settings → Environment Variables
5. Copy the KV env vars to `.env.local` for local dev (see `.env.local.example`)
6. Run `npm install && npm run seed` to load the initial rep list
7. Run `npm run dev` for local development

## Environment Variables

| Variable | Source |
|---|---|
| `KV_REST_API_URL` | Auto-set by Vercel KV |
| `KV_REST_API_TOKEN` | Auto-set by Vercel KV |
| `ADMIN_PASSWORD` | Set manually in Vercel |
