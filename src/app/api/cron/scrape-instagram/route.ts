import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RAPIDAPI_HOST = "instagram-looter2.p.rapidapi.com";
const RETENTION_DAYS = 30;

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

async function rapidApiFetch(endpoint: string, params: Record<string, string>) {
  const url = new URL(`https://${RAPIDAPI_HOST}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`RapidAPI ${endpoint} returned ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}

async function downloadToStorage(
  mediaUrl: string,
  bucket: string,
  folder: string,
  filename: string,
  expectedType: "image" | "video"
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const res = await fetch(mediaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": expectedType === "video" ? "video/*,*/*;q=0.8" : "image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://www.instagram.com/",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`${expectedType} fetch failed [${res.status}] for ${mediaUrl.slice(0, 80)}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || (expectedType === "video" ? "video/mp4" : "image/jpeg");
    const ext = expectedType === "video" ? "mp4" : contentType.includes("png") ? "png" : "jpg";
    const path = `${folder}/${filename}.${ext}`;

    // Try upload, if file exists try update
    let error;
    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType });
    if (uploadErr?.message?.includes("already exists")) {
      const { error: updateErr } = await supabase.storage
        .from(bucket)
        .update(path, buffer, { contentType });
      error = updateErr;
    } else {
      error = uploadErr;
    }

    if (error) {
      console.error(`Storage upload error [${path}]: ${error.message} | ${JSON.stringify(error)}`);
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return publicUrl.publicUrl;
  } catch (err) {
    console.error(`${expectedType} download error:`, err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  const accounts = (process.env.IG_ACCOUNTS || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (accounts.length === 0) {
    return NextResponse.json({ error: "No IG_ACCOUNTS configured" }, { status: 400 });
  }

  // Single retention cutoff used both for the per-item pre-filter and the
  // trailing prune, so a borderline post can't be inserted in the per-item
  // loop and then deleted a few seconds later by a newer prune cutoff.
  const retentionCutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const retentionCutoffIso = new Date(retentionCutoffMs).toISOString();

  const results: Record<string, { added: number; errors: string[]; debug?: string }> = {};

  for (const username of accounts) {
    const accountResult: { added: number; errors: string[]; debug?: string } = { added: 0, errors: [] };
    results[username] = accountResult;

    try {
      // Fetch profile — this API embeds recent media in the profile response
      const profile = await rapidApiFetch("/profile", { username });

      // Log top-level keys for debugging
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = profile as Record<string, any>;
      const topKeys = Object.keys(p);
      accountResult.debug = `profile keys: [${topKeys.join(", ")}]`;

      // Save user_id to ig_accounts if not already cached
      const userId = String(p?.data?.id || p?.id || p?.user?.pk || p?.pk || "");
      if (userId && userId !== "undefined") {
        await supabase
          .from("ig_accounts")
          .upsert({ username, user_id: userId }, { onConflict: "username" });
      }

      // Try to find media items in the profile response
      // Different IG scraper APIs nest media in various places
      const mediaItems =
        p?.data?.edge_owner_to_timeline_media?.edges ||
        p?.data?.medias ||
        p?.data?.media?.items ||
        p?.data?.posts ||
        p?.data?.items ||
        p?.edge_owner_to_timeline_media?.edges ||
        p?.medias ||
        p?.media?.items ||
        p?.posts ||
        p?.items ||
        p?.user?.edge_owner_to_timeline_media?.edges ||
        p?.user?.medias ||
        p?.user?.media?.items ||
        null;

      if (!mediaItems || !Array.isArray(mediaItems)) {
        // Dump deeper structure for debugging
        const dataKeys = p?.data ? Object.keys(p.data) : [];
        const userKeys = p?.user ? Object.keys(p.user) : [];
        accountResult.debug += ` | data keys: [${dataKeys.join(", ")}] | user keys: [${userKeys.join(", ")}]`;

        // Try /reels endpoint as fallback. The param is `id`, not `user_id` —
        // using `user_id` returns "Invalid Request Parameters" from the API.
        // We only have a user_id here if /profile succeeded and ig_accounts
        // was populated; fall back to username as a no-op probe otherwise.
        if (userId) {
          try {
            const reelsResponse = await rapidApiFetch("/reels", { id: userId });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = reelsResponse as Record<string, any>;
            const reelsKeys = Object.keys(r);
            accountResult.debug += ` | reels keys: [${reelsKeys.join(", ")}]`;
          } catch (reelsErr) {
            accountResult.debug += ` | reels err: ${reelsErr instanceof Error ? reelsErr.message.slice(0, 100) : "unknown"}`;
          }
        } else {
          accountResult.debug += ` | reels skipped (no user_id)`;
        }

        accountResult.errors.push("Could not find media items in profile response");
        continue;
      }

      // Normalize items — handle both {node: {...}} (graph API style) and flat items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: Record<string, any>[] = mediaItems.map((item: any) => item?.node || item);

      // Debug: dump first item's keys and caption-related fields
      if (items.length > 0) {
        const first = items[0];
        const keys = Object.keys(first);
        const captionField = first?.edge_media_to_caption || first?.caption || "NO_CAPTION_FIELD";
        accountResult.debug = (accountResult.debug || "") +
          ` | item keys: [${keys.slice(0, 15).join(", ")}...]` +
          ` | caption field: ${JSON.stringify(captionField).slice(0, 200)}` +
          ` | display_url: ${first?.display_url ? "YES" : "NO"}` +
          ` | thumbnail_src: ${first?.thumbnail_src ? String(first.thumbnail_src).slice(0, 80) : "NO"}` +
          ` | thumbnail_resources: ${first?.thumbnail_resources ? JSON.stringify(first.thumbnail_resources).slice(0, 150) : "NO"}` +
          ` | media_preview: ${first?.media_preview ? "YES(" + String(first.media_preview).length + " chars)" : "NO"}`;
      }

      // Get existing source_ids for this account so we can skip already-stored
      // posts and avoid re-downloading their images on every run.
      const shortcodes = items
        .map((item) => String(item.code || item.shortcode || ""))
        .filter(Boolean);

      if (shortcodes.length === 0) {
        accountResult.errors.push("No shortcodes found in media items");
        continue;
      }

      // Skip only posts that already have a known-good storage URL. Posts
      // with NULL/CDN/base64 image_urls are re-processed so failed image
      // uploads from a previous run get retried automatically.
      const { data: existing, error: existingErr } = await supabase
        .from("posts")
        .select("source_id, image_url")
        .eq("source", "instagram")
        .eq("account", username);

      if (existingErr) {
        accountResult.errors.push(`dedupe query: ${existingErr.message}`);
      }

      const goodIds = new Set(
        (existing ?? [])
          .filter((e) => (e.image_url || "").includes("/storage/v1/object/public/post-images/"))
          .map((e) => e.source_id)
      );
      accountResult.debug = (accountResult.debug || "") +
        ` | total_in_db=${(existing ?? []).length} | with_storage=${goodIds.size}`;

      for (const item of items) {
        const shortcode = String(item.code || item.shortcode || "");
        if (!shortcode || goodIds.has(shortcode)) continue;

        try {
          // Extract caption from graph API format (always use item, it has the data)
          const captionEdges = item?.edge_media_to_caption?.edges;
          const captionFromEdges = Array.isArray(captionEdges) && captionEdges.length > 0
            ? captionEdges[0]?.node?.text
            : null;
          const caption = captionFromEdges || item?.caption?.text || "";

          // Debug first item's caption extraction
          if (shortcode === shortcodes[0]) {
            accountResult.debug = (accountResult.debug || "") +
              ` | CAPTION_DEBUG: edges=${JSON.stringify(captionEdges).slice(0, 100)}, result="${String(caption).slice(0, 50)}"`;
          }

          // NOTE: item.media_preview is a tiny blur-preview blob (~150-400 chars
          // base64), NOT a real thumbnail. Don't use it as image_url.
          const cdnUrl = String(item?.display_url || item?.thumbnail_src || "");

          const takenAt = item?.taken_at_timestamp || item?.taken_at;
          const publishedAtMs = takenAt
            ? (typeof takenAt === "number" ? takenAt * 1000 : new Date(takenAt).getTime())
            : Date.now();
          const publishedAt = new Date(publishedAtMs).toISOString();

          // Skip items already outside the retention window — they'd just get
          // pruned at the end of the run, so don't waste an image download.
          if (publishedAtMs < retentionCutoffMs) {
            continue;
          }

          // Try Supabase Storage upload; fall back to the raw CDN URL if it
          // fails. CDN URLs are signed and expire in ~hours, so the dedupe-skip
          // above ignores rows without storage URLs and lets the next cron run
          // retry the upload until it sticks.
          let finalImageUrl: string | null = null;
          if (cdnUrl) {
            const stored = await downloadToStorage(cdnUrl, "post-images", "instagram", shortcode, "image");
            finalImageUrl = stored || cdnUrl;
          }

          // Handle video posts — store CDN URL directly (no storage upload to avoid timeout/size limits)
          const isVideo = item?.is_video === true || item?.media_type === 2;
          const finalVideoUrl: string | null = isVideo
            ? (item?.video_url || item?.video_versions?.[0]?.url || null)
            : null;

          const insertData = {
            source: "instagram" as const,
            source_id: shortcode,
            account: username,
            caption: String(caption || "").slice(0, 2000),
            image_url: finalImageUrl,
            video_url: finalVideoUrl,
            published_at: publishedAt,
            metadata: {
              likes: item?.edge_liked_by?.count || item?.like_count || 0,
              comments: item?.edge_media_to_comment?.count || item?.comment_count || 0,
              is_video: isVideo,
            },
          };

          // Debug: log first insert's full data
          if (shortcode === shortcodes[0]) {
            accountResult.debug = (accountResult.debug || "") +
              ` | INSERT_DATA: caption_len=${insertData.caption.length}, caption_start="${insertData.caption.slice(0, 30)}", img=${insertData.image_url ? "YES" : "NULL"}`;
          }

          const { error: insertError } = await supabase
            .from("posts")
            .upsert(insertData, { onConflict: "source_id" });

          if (insertError) {
            accountResult.errors.push(`Upsert ${shortcode}: ${insertError.message}`);
          } else {
            accountResult.added++;
          }
        } catch (postErr) {
          accountResult.errors.push(
            `Post ${shortcode}: ${postErr instanceof Error ? postErr.message : "unknown error"}`
          );
        }
      }
    } catch (err) {
      accountResult.errors.push(
        err instanceof Error ? err.message : "unknown error"
      );
    }
  }

  // Prune posts older than the retention window (uses the cutoff computed
  // at the top of the request so it matches the per-item pre-filter).
  const { count: prunedCount, error: pruneErr } = await supabase
    .from("posts")
    .delete({ count: "exact" })
    .eq("source", "instagram")
    .lt("published_at", retentionCutoffIso);

  const totalAdded = Object.values(results).reduce((sum, r) => sum + r.added, 0);
  await supabase.from("scrape_log").insert({
    source: "instagram",
    items_added: totalAdded,
    metadata: {
      ...results,
      _pruned: prunedCount ?? 0,
      _prune_cutoff: retentionCutoffIso,
      _prune_error: pruneErr?.message ?? null,
      _retention_days: RETENTION_DAYS,
    },
  });

  return NextResponse.json({
    success: true,
    results,
    pruned: prunedCount ?? 0,
    retention_days: RETENTION_DAYS,
  });
}
