/**
 * Ortto API client for the Email Hub.
 *
 * Docs: https://help.ortto.com/a-250-api-reference
 *
 * Region base URLs:
 *   US: https://api.ap3api.com
 *   EU: https://api.eu.ap3api.com   ← default for this project
 *   AU: https://api.au.ap3api.com
 */
function getBaseUrl(): string {
  return process.env.ORTTO_BASE_URL || "https://api.eu.ap3api.com";
}

function getApiKey(): string {
  const key = process.env.ORTTO_API_KEY;
  if (!key) throw new Error("ORTTO_API_KEY is not set");
  return key;
}

export type OrttoCalendarRequest = {
  start: { year: number; month: number };
  end: { year: number; month: number };
  timezone: string;
};

export type OrttoCampaign = {
  id: string;
  name: string;
  type: string;
  state: string;
  asset_id?: string;
  sent_at?: string;
  a_b_testing?: {
    variant_a_asset_id?: string;
    variant_b_asset_id?: string;
  };
};

export type OrttoAssetHtml = {
  html: string;
  from_email?: string;
  from_name?: string;
  subject?: string;
  preview?: string;
  reply_to?: string;
};

export type FlatEmailCandidate = {
  asset_id: string;
  campaign_id: string;
  variant: "a" | "b" | null;
  name: string;
  sent_at: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function orttoPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers = {
    "X-Api-Key": getApiKey(),
    "Content-Type": "application/json",
  };

  let attempt = 0;
  // One retry on 429, honoring `try-in-seconds`.
  while (true) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (res.status === 429 && attempt === 0) {
      let waitSec = 2;
      try {
        const json = (await res.clone().json()) as { "try-in-seconds"?: number };
        if (typeof json["try-in-seconds"] === "number" && json["try-in-seconds"] > 0) {
          waitSec = Math.min(json["try-in-seconds"], 30);
        }
      } catch {
        // ignore parse error, use default wait
      }
      await sleep(waitSec * 1000);
      attempt++;
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Ortto ${path} returned ${res.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as T;
  }
}

export async function fetchCampaigns(req: OrttoCalendarRequest): Promise<OrttoCampaign[]> {
  const data = await orttoPost<{ campaigns?: OrttoCampaign[] } & Record<string, unknown>>(
    "/v1/campaign/calendar",
    req
  );
  // Ortto's response shape isn't fully documented; tolerate either { campaigns: [...] }
  // or a bare array, and filter out anything that isn't shaped like a campaign.
  const list: unknown = Array.isArray(data) ? data : data.campaigns;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (c): c is OrttoCampaign =>
      typeof c === "object" && c !== null && typeof (c as OrttoCampaign).id === "string"
  );
}

export async function fetchAssetHtml(asset_id: string): Promise<OrttoAssetHtml> {
  return orttoPost<OrttoAssetHtml>("/v1/assets/get-html", { asset_id });
}

/** Case-insensitive "any keyword in name" filter. */
export function filterByName(campaigns: OrttoCampaign[], keywords: string[]): OrttoCampaign[] {
  if (keywords.length === 0) return campaigns;
  const needles = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  if (needles.length === 0) return campaigns;
  return campaigns.filter((c) => {
    const hay = (c.name || "").toLowerCase();
    return needles.some((n) => hay.includes(n));
  });
}

/**
 * Flatten A/B test campaigns into per-variant rows. Non-A/B campaigns produce
 * a single row with variant: null. Campaigns missing any usable asset_id
 * (e.g. emails not built via Asset Manager) are dropped.
 */
export function flattenAbVariants(campaigns: OrttoCampaign[]): FlatEmailCandidate[] {
  const out: FlatEmailCandidate[] = [];
  for (const c of campaigns) {
    const variantA = c.a_b_testing?.variant_a_asset_id;
    const variantB = c.a_b_testing?.variant_b_asset_id;
    if (variantA || variantB) {
      if (variantA) {
        out.push({
          asset_id: variantA,
          campaign_id: c.id,
          variant: "a",
          name: c.name,
          sent_at: c.sent_at ?? null,
        });
      }
      if (variantB) {
        out.push({
          asset_id: variantB,
          campaign_id: c.id,
          variant: "b",
          name: c.name,
          sent_at: c.sent_at ?? null,
        });
      }
    } else if (c.asset_id) {
      out.push({
        asset_id: c.asset_id,
        campaign_id: c.id,
        variant: null,
        name: c.name,
        sent_at: c.sent_at ?? null,
      });
    }
  }
  return out;
}

/**
 * Pull the first usable <img src="..."> from email HTML. Skips:
 *   - data: URIs (inline base64, usually decorative)
 *   - images explicitly hidden via display:none
 *   - tiny images (width or height < 100) — these are typically tracking
 *     pixels or spacer GIFs, not the email's hero image.
 *
 * Returns null if nothing qualifies.
 */
export function extractFirstImage(html: string): string | null {
  const imgRegex = /<img\b[^>]*>/gi;
  const matches = html.match(imgRegex);
  if (!matches) return null;

  for (const tag of matches) {
    const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = srcMatch[1].trim();
    if (!src || src.startsWith("data:")) continue;

    const styleMatch = tag.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
    if (styleMatch && /display\s*:\s*none/i.test(styleMatch[1])) continue;

    const widthAttr = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const heightAttr = tag.match(/\bheight\s*=\s*["']?(\d+)/i);
    const width = widthAttr ? parseInt(widthAttr[1], 10) : null;
    const height = heightAttr ? parseInt(heightAttr[1], 10) : null;
    if ((width !== null && width < 100) || (height !== null && height < 100)) continue;

    if (src.startsWith("//")) return `https:${src}`;
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    // Skip relative URLs — emails should always use absolute image hosts.
    continue;
  }

  return null;
}

/**
 * Ortto's sent_at is a human string like "Tue 26 Mar 2025 4:33 PM".
 * Date.parse handles this on V8 in practice; if it returns NaN we fall back
 * to null so the caller can use a default.
 */
export function parseSentAt(s: string | null | undefined): Date | null {
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

/** Build a {start, end} window covering the last `days` days, in UTC. */
export function buildCalendarWindow(days: number): {
  start: { year: number; month: number };
  end: { year: number; month: number };
} {
  const now = new Date();
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    start: { year: past.getUTCFullYear(), month: past.getUTCMonth() + 1 },
    end: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 },
  };
}

export function parseKeywords(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}
