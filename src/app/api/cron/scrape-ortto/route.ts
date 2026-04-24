import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  buildCalendarWindow,
  extractFirstImage,
  fetchAssetHtml,
  fetchCampaigns,
  filterByName,
  flattenAbVariants,
  parseKeywords,
  parseSentAt,
} from "@/lib/ortto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;
// 7-day window so a missed daily run is recovered on the next one.
const CALENDAR_WINDOW_DAYS = 7;
// Stay under the Ortto Professional plan limit (10 req/s).
const REQUEST_INTERVAL_MS = 150;

function isAuthorized(request: NextRequest): boolean {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return false;
  if (secret === cronSecret) return true;
  if (authHeader === `Bearer ${cronSecret}`) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadImageToStorage(
  imageUrl: string,
  folder: string,
  filename: string
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`Image fetch failed [${res.status}] for ${imageUrl.slice(0, 80)}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const path = `${folder}/${filename}.${ext}`;

    let error;
    const { error: uploadErr } = await supabase.storage
      .from("post-images")
      .upload(path, buffer, { contentType });
    if (uploadErr?.message?.includes("already exists")) {
      const { error: updateErr } = await supabase.storage
        .from("post-images")
        .update(path, buffer, { contentType });
      error = updateErr;
    } else {
      error = uploadErr;
    }

    if (error) {
      console.error(`Storage upload error [${path}]: ${error.message}`);
      return null;
    }

    const { data: publicUrl } = supabase.storage.from("post-images").getPublicUrl(path);
    return publicUrl.publicUrl;
  } catch (err) {
    console.error("Image download error:", err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const errors: string[] = [];
  const skipped: string[] = [];
  let added = 0;
  const debug: Record<string, unknown> = {};

  try {
    const keywords = parseKeywords(process.env.ORTTO_EMAIL_NAME_INCLUDES);
    const timezone = process.env.ORTTO_TIMEZONE || "Europe/London";

    const window = buildCalendarWindow(CALENDAR_WINDOW_DAYS);
    const campaigns = await fetchCampaigns({ ...window, timezone });

    const sentEmails = campaigns.filter(
      (c) => c.type === "email" && c.state === "sent"
    );
    const matched = filterByName(sentEmails, keywords);
    const candidates = flattenAbVariants(matched);

    debug.window = window;
    debug.keywords = keywords;
    debug.campaigns_total = campaigns.length;
    debug.states_seen = Array.from(new Set(campaigns.map((c) => c.state)));
    debug.types_seen = Array.from(new Set(campaigns.map((c) => c.type)));
    debug.sent_email_count = sentEmails.length;
    debug.matched_count = matched.length;
    debug.candidates_count = candidates.length;
    debug.sample_sent_names = sentEmails.slice(0, 10).map((c) => c.name);
    debug.sample_all_names = campaigns.slice(0, 10).map((c) => ({
      name: c.name,
      type: c.type,
      state: c.state,
    }));

    if (candidates.length > 0) {
      const assetIds = candidates.map((c) => c.asset_id);
      const { data: existing } = await supabase
        .from("emails")
        .select("asset_id")
        .in("asset_id", assetIds);
      const existingIds = new Set((existing ?? []).map((e) => e.asset_id));

      const toFetch = candidates.filter((c) => !existingIds.has(c.asset_id));

      for (const cand of toFetch) {
        try {
          const asset = await fetchAssetHtml(cand.asset_id);

          if (!asset.html) {
            skipped.push(`${cand.asset_id}: empty html`);
            await sleep(REQUEST_INTERVAL_MS);
            continue;
          }

          const sentDate = parseSentAt(cand.sent_at) ?? new Date();
          if (!parseSentAt(cand.sent_at)) {
            errors.push(`${cand.asset_id}: invalid sent_at "${cand.sent_at}", using now`);
          }

          const firstImg = extractFirstImage(asset.html);
          let storedImageUrl: string | null = null;
          if (firstImg) {
            const filename = cand.variant
              ? `${cand.asset_id}-${cand.variant}`
              : cand.asset_id;
            storedImageUrl = await downloadImageToStorage(firstImg, "email", filename);
          }

          const { error: insertError } = await supabase.from("emails").insert({
            asset_id: cand.asset_id,
            campaign_id: cand.campaign_id,
            variant: cand.variant,
            name: cand.name,
            subject: asset.subject ?? null,
            preview: asset.preview ?? null,
            from_name: asset.from_name ?? null,
            from_email: asset.from_email ?? null,
            reply_to: asset.reply_to ?? null,
            body_html: asset.html,
            image_url: storedImageUrl,
            sent_at: sentDate.toISOString(),
          });

          if (insertError) {
            errors.push(`Insert ${cand.asset_id}: ${insertError.message}`);
          } else {
            added++;
          }
        } catch (err) {
          errors.push(
            `${cand.asset_id}: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }

        await sleep(REQUEST_INTERVAL_MS);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "unknown error");
  }

  // Purge old emails so the hub stays at ~30 days of content.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count: prunedCount, error: pruneErr } = await supabase
    .from("emails")
    .delete({ count: "exact" })
    .lt("sent_at", cutoff);

  await supabase.from("scrape_log").insert({
    source: "ortto",
    items_added: added,
    metadata: {
      errors,
      skipped,
      _pruned: prunedCount ?? 0,
      _prune_cutoff: cutoff,
      _prune_error: pruneErr?.message ?? null,
      _retention_days: RETENTION_DAYS,
    },
  });

  return NextResponse.json({
    success: true,
    added,
    pruned: prunedCount ?? 0,
    errors,
    skipped,
    debug,
  });
}
