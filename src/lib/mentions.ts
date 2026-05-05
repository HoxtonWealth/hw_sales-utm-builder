import Firecrawl from "@mendable/firecrawl-js";
import Parser from "rss-parser";
import type { SupabaseClient } from "@supabase/supabase-js";

type CoverageItem = {
  title?: string;
  url: string;
  publication?: string;
  published_date?: string;
};

type SourceResult = { added: number; errors: string[] };

const RETENTION_DAYS = 90;

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
];

const coverageSchema = {
  type: "object",
  properties: {
    coverage_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string", format: "uri" },
          publication: { type: "string" },
          published_date: { type: "string" },
        },
        required: ["url"],
      },
    },
  },
  required: ["coverage_items"],
} as const;

function safeIsoDate(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

// Coveragebook is LLM-extracted and Google Alerts URLs come back with
// random tracking junk; without normalization the (source, url) unique
// constraint lets duplicates through (trailing slash, utm_*, etc.).
function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

// Google Alerts wraps every outbound URL in a google.com/url?url=... redirector.
// Unwrap so dedupe keys and the link shown in the UI point at the real article.
function cleanGoogleAlertsUrl(url: string): string {
  try {
    const u = new URL(url);
    const target = u.searchParams.get("url");
    return target ?? url;
  } catch {
    return url;
  }
}

async function fetchCoveragebook(supabase: SupabaseClient): Promise<SourceResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const shareUrl = process.env.COVERAGEBOOK_SHARE_URL;

  if (!apiKey) return { added: 0, errors: ["FIRECRAWL_API_KEY not set"] };
  if (!shareUrl) return { added: 0, errors: ["COVERAGEBOOK_SHARE_URL not set"] };

  const errors: string[] = [];
  let added = 0;

  try {
    const firecrawl = new Firecrawl({ apiKey });
    const result = await firecrawl.scrape(shareUrl, {
      formats: [
        {
          type: "json",
          schema: coverageSchema,
          prompt:
            "Extract every press or media coverage item shown on this page. For each item return the article title, the URL to the external article (not the Coveragebook page itself), the publication name, and the published date if available. Return as coverage_items array.",
        },
      ],
    });

    const extracted = result.json as { coverage_items?: CoverageItem[] } | undefined;
    const items = Array.isArray(extracted?.coverage_items) ? extracted.coverage_items : [];

    if (items.length === 0) {
      errors.push("Coveragebook: no items extracted from page");
    }

    for (const item of items) {
      if (!item?.url) continue;
      const normalized = normalizeUrl(item.url);

      const { error } = await supabase.from("mentions").upsert(
        {
          source: "coveragebook",
          url: normalized,
          title: item.title ?? null,
          snippet: item.publication ?? null,
          published_at: safeIsoDate(item.published_date),
          source_feed_id: null,
          raw_data: item,
        },
        { onConflict: "source,url" }
      );

      if (error) {
        errors.push(`Coveragebook upsert ${normalized}: ${error.message}`);
      } else {
        added++;
      }
    }
  } catch (err) {
    errors.push(`Coveragebook: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  return { added, errors };
}

async function fetchGoogleAlerts(supabase: SupabaseClient): Promise<SourceResult> {
  const errors: string[] = [];
  let added = 0;

  const { data: feeds, error: feedsErr } = await supabase
    .from("google_alert_feeds")
    .select("id, name, rss_url")
    .eq("active", true);

  if (feedsErr) {
    return { added: 0, errors: [`Load feeds: ${feedsErr.message}`] };
  }
  if (!feeds || feeds.length === 0) {
    return { added: 0, errors: ["No active Google Alert feeds"] };
  }

  const parser = new Parser({ timeout: 20000 });

  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.rss_url);

      for (const item of parsed.items ?? []) {
        const rawLink = item.link;
        if (!rawLink) continue;
        const cleaned = normalizeUrl(cleanGoogleAlertsUrl(rawLink));

        // Trim raw_data — RSS items can carry huge content blobs we don't need.
        const rawData = {
          title: item.title ?? null,
          link: item.link ?? null,
          isoDate: item.isoDate ?? null,
          pubDate: item.pubDate ?? null,
          contentSnippet: item.contentSnippet?.slice(0, 1000) ?? null,
        };

        const { error } = await supabase.from("mentions").upsert(
          {
            source: "google_alerts",
            url: cleaned,
            title: item.title ?? null,
            snippet: item.contentSnippet ?? null,
            published_at: safeIsoDate(item.isoDate ?? item.pubDate),
            source_feed_id: feed.id,
            raw_data: rawData,
          },
          { onConflict: "source,url" }
        );

        if (error) {
          errors.push(`Alerts upsert [${feed.name}] ${cleaned}: ${error.message}`);
        } else {
          added++;
        }
      }
    } catch (err) {
      errors.push(
        `Feed ${feed.name}: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }

  return { added, errors };
}

// Two-pass prune: by published_at when present, fall back to created_at when null.
async function pruneOldMentions(
  supabase: SupabaseClient
): Promise<{ deleted: number; errors: string[] }> {
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const errors: string[] = [];
  let deleted = 0;

  const byPublished = await supabase
    .from("mentions")
    .delete({ count: "exact" })
    .lt("published_at", cutoff);
  if (byPublished.error) errors.push(`prune by published_at: ${byPublished.error.message}`);
  else deleted += byPublished.count ?? 0;

  const byCreated = await supabase
    .from("mentions")
    .delete({ count: "exact" })
    .is("published_at", null)
    .lt("created_at", cutoff);
  if (byCreated.error) errors.push(`prune by created_at: ${byCreated.error.message}`);
  else deleted += byCreated.count ?? 0;

  return { deleted, errors };
}

export async function fetchAllMentions(supabase: SupabaseClient) {
  const coveragebook = await fetchCoveragebook(supabase);
  const google_alerts = await fetchGoogleAlerts(supabase);
  const prune = await pruneOldMentions(supabase);
  return { coveragebook, google_alerts, prune };
}
