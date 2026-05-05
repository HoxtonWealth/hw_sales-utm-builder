-- Mentions feature: press/media coverage of Hoxton Wealth.
-- Fed by /api/cron/fetch-mentions (daily 02:00 UTC) which pulls from
-- Coveragebook (web-scraped via Firecrawl) and Google Alerts (RSS).
-- 90-day retention enforced in src/lib/mentions.ts (pruneOldMentions).
-- RLS intentionally disabled to match the existing posts/emails tables.

create table if not exists google_alert_feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rss_url text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists mentions (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  url text not null,
  title text,
  snippet text,
  published_at timestamptz,
  source_feed_id uuid references google_alert_feeds(id) on delete set null,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  unique (source, url)
);

create index if not exists mentions_published_at_idx
  on mentions (published_at desc nulls last);

create index if not exists mentions_source_idx
  on mentions (source);
