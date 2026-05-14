import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  runHogQL,
  rowsToObjects,
  PostHogConfigError,
} from "@/lib/posthog-query";

export const dynamic = "force-dynamic";

const WINDOW = "INTERVAL 30 DAY";

const QUERIES = {
  kpis: `
    SELECT
      countIf(event NOT LIKE '$%') AS total_events,
      countIf(event = '$pageview') AS pageviews,
      countIf(event = 'utm_generated') AS utms_generated,
      countIf(event = 'link_shortened') AS links_shortened,
      countIf(event = 'ai_post_generated') AS ai_posts_generated,
      countIf(event = 'enrichment_completed' AND properties.saved = true) AS enrichments_saved,
      countIf(event = 'enrichment_quota_blocked') AS quota_blocks
    FROM events
    WHERE timestamp >= now() - ${WINDOW}
  `,

  distinctContacts: `
    SELECT count(distinct properties.hxt_id) AS unique_contacts
    FROM events
    WHERE event = 'contact_looked_up'
      AND properties.result = 'found'
      AND properties.hxt_id IS NOT NULL
      AND timestamp >= now() - ${WINDOW}
  `,

  dailyPageviews: `
    SELECT toDate(timestamp) AS day, count() AS views
    FROM events
    WHERE event = '$pageview' AND timestamp >= now() - ${WINDOW}
    GROUP BY day
    ORDER BY day
  `,

  eventVolume: `
    SELECT event, count() AS cnt
    FROM events
    WHERE timestamp >= now() - ${WINDOW}
      AND event NOT LIKE '$%'
    GROUP BY event
    ORDER BY cnt DESC
  `,

  lookupsByRep: `
    SELECT properties.rep_email AS rep, count() AS lookups
    FROM events
    WHERE event = 'contact_looked_up' AND timestamp >= now() - ${WINDOW}
    GROUP BY rep
    ORDER BY lookups DESC
    LIMIT 50
  `,

  lookupsByResult: `
    SELECT properties.result AS result, count() AS cnt
    FROM events
    WHERE event = 'contact_looked_up' AND timestamp >= now() - ${WINDOW}
    GROUP BY result
    ORDER BY cnt DESC
  `,

  enrichmentOutcomes: `
    SELECT properties.kind AS kind, properties.outcome AS outcome, count() AS cnt
    FROM events
    WHERE event = 'enrichment_completed' AND timestamp >= now() - ${WINDOW}
    GROUP BY kind, outcome
    ORDER BY kind, cnt DESC
  `,

  enrichmentHitRate: `
    SELECT
      properties.kind AS kind,
      countIf(event = 'enrichment_started') AS started,
      countIf(event = 'enrichment_completed' AND properties.outcome = 'found') AS found,
      countIf(event = 'enrichment_completed' AND properties.outcome = 'found' AND properties.saved = true) AS saved
    FROM events
    WHERE event IN ('enrichment_started', 'enrichment_completed')
      AND timestamp >= now() - ${WINDOW}
    GROUP BY kind
    ORDER BY kind
  `,

  quotaBlocksByRep: `
    SELECT properties.rep_email AS rep, count() AS blocks
    FROM events
    WHERE event = 'enrichment_quota_blocked' AND timestamp >= now() - ${WINDOW}
    GROUP BY rep
    ORDER BY blocks DESC
    LIMIT 50
  `,

  utmsByRep: `
    SELECT
      properties.rep_name AS rep,
      properties.source_page AS page,
      count() AS cnt
    FROM events
    WHERE event = 'utm_generated' AND timestamp >= now() - ${WINDOW}
    GROUP BY rep, page
    ORDER BY cnt DESC
    LIMIT 100
  `,

  contentHubActivity: `
    SELECT event, count() AS cnt
    FROM events
    WHERE event IN ('ai_post_generated', 'ai_post_copied', 'content_caption_copied', 'content_post_opened')
      AND timestamp >= now() - ${WINDOW}
    GROUP BY event
    ORDER BY cnt DESC
  `,

  emailHubActivity: `
    SELECT event, count() AS cnt
    FROM events
    WHERE event IN ('email_subject_copied', 'email_html_downloaded', 'email_opened')
      AND timestamp >= now() - ${WINDOW}
    GROUP BY event
    ORDER BY cnt DESC
  `,

  assetHubActivity: `
    SELECT event, count() AS cnt
    FROM events
    WHERE event IN ('asset_opened', 'asset_pdf_opened', 'asset_pdf_downloaded')
      AND timestamp >= now() - ${WINDOW}
    GROUP BY event
    ORDER BY cnt DESC
  `,

  topPages: `
    SELECT properties.$current_url AS url, count() AS views
    FROM events
    WHERE event = '$pageview' AND timestamp >= now() - ${WINDOW}
    GROUP BY url
    ORDER BY views DESC
    LIMIT 15
  `,
} as const;

type QueryKey = keyof typeof QUERIES;

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries = Object.entries(QUERIES) as [QueryKey, string][];
    const settled = await Promise.allSettled(
      entries.map(([, sql]) => runHogQL(sql))
    );

    const data: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    settled.forEach((res, i) => {
      const key = entries[i][0];
      if (res.status === "fulfilled") {
        data[key] = rowsToObjects(res.value);
      } else {
        errors[key] = res.reason instanceof Error ? res.reason.message : String(res.reason);
      }
    });

    return NextResponse.json({ data, errors, window: "30d" });
  } catch (err) {
    if (err instanceof PostHogConfigError) {
      return NextResponse.json(
        { error: err.message, configMissing: true },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
