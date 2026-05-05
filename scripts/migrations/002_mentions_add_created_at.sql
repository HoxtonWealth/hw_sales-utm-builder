-- Patch for projects where a `mentions` table existed before 001 ran;
-- the IF NOT EXISTS in 001 silently skipped its CREATE, leaving the
-- table without `created_at`, which the SELECT and retention-prune
-- queries both depend on.
--
-- Safe to re-run: column add is gated by IF NOT EXISTS.

alter table mentions
  add column if not exists created_at timestamptz not null default now();
