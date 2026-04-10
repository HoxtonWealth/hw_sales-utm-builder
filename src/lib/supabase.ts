import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

/**
 * Next.js App Router patches global fetch with its Data Cache. supabase-js
 * uses global fetch, which means SELECT responses were being cached across
 * invocations even on routes marked `dynamic = "force-dynamic"` (that
 * directive disables the Full Route Cache but not the Data Cache). The
 * result was stale rows being served to the Content Hub after a DB update
 * until the cache entry expired. Wrap fetch with `cache: "no-store"` so
 * Next.js never caches Supabase responses.
 */
function uncachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, cache: "no-store" });
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!,
      {
        global: { fetch: uncachedFetch },
      }
    );
  }
  return _supabase;
}
