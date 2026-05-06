-- Asset Hub: admin-curated library of PDF links for sales reps.
-- Files themselves stay on their existing CDNs (datocms etc.) — we only
-- store the URL + metadata. RLS intentionally disabled to match the
-- mentions / posts / emails tables (server uses service-role key).

create table if not exists assets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  url         text not null,
  description text,
  tags        text[] not null default '{}',
  shareable   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists assets_tags_idx
  on assets using gin (tags);

create index if not exists assets_created_at_idx
  on assets (created_at desc);
