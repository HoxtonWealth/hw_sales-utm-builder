import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RAPIDAPI_HOST = "instagram-looter2.p.rapidapi.com";

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

async function downloadImageToStorage(
  imageUrl: string,
  folder: string,
  filename: string
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://www.instagram.com/",
      },
    });
    if (!res.ok) {
      console.error(`Image fetch failed [${res.status}]: ${imageUrl.slice(0, 100)}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const path = `${folder}/${filename}.${ext}`;

    const { error } = await supabase.storage
      .from("post-images")
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      console.error(`Storage upload error [${path}]:`, error.message, error);
      return null;
    }

    const { data: publicUrl } = supabase.storage
      .from("post-images")
      .getPublicUrl(path);

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

  const accounts = (process.env.IG_ACCOUNTS || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (accounts.length === 0) {
    return NextResponse.json({ error: "No IG_ACCOUNTS configured" }, { status: 400 });
  }

  // Cleanup: delete Instagram posts with expired CDN URLs or missing images
  await supabase
    .from("posts")
    .delete()
    .eq("source", "instagram")
    .or("image_url.like.%fbcdn.net%,image_url.is.null");

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

        // Try /reels endpoint as fallback (we know it exists)
        try {
          const reelsResponse = await rapidApiFetch("/reels", { user_id: userId || username });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = reelsResponse as Record<string, any>;
          const reelsKeys = Object.keys(r);
          accountResult.debug += ` | reels keys: [${reelsKeys.join(", ")}]`;
        } catch (reelsErr) {
          accountResult.debug += ` | reels err: ${reelsErr instanceof Error ? reelsErr.message.slice(0, 100) : "unknown"}`;
        }

        accountResult.errors.push("Could not find media items in profile response");
        continue;
      }

      // Normalize items — handle both {node: {...}} (graph API style) and flat items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: Record<string, any>[] = mediaItems.map((item: any) => item?.node || item);

      // Get existing source_ids to filter duplicates
      const shortcodes = items
        .map((item) => String(item.code || item.shortcode || ""))
        .filter(Boolean);

      if (shortcodes.length === 0) {
        accountResult.errors.push("No shortcodes found in media items");
        continue;
      }

      const { data: existing } = await supabase
        .from("posts")
        .select("source_id")
        .eq("source", "instagram")
        .in("source_id", shortcodes);

      const existingIds = new Set((existing ?? []).map((e) => e.source_id));

      for (const item of items) {
        const shortcode = String(item.code || item.shortcode || "");
        if (!shortcode || existingIds.has(shortcode)) continue;

        try {
          // Try fetching post details for richer data
          let post = item;
          try {
            const postDetail = await rapidApiFetch("/post", { code: shortcode });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            post = (postDetail?.data || postDetail) as Record<string, any>;
          } catch {
            // Fall back to the item data from profile response
          }

          const caption =
            post?.caption?.text ||
            post?.edge_media_to_caption?.edges?.[0]?.node?.text ||
            item?.caption?.text ||
            "";
          const imageUrl =
            post?.image_versions2?.candidates?.[0]?.url ||
            post?.display_url ||
            post?.thumbnail_src ||
            item?.image_versions2?.candidates?.[0]?.url ||
            item?.display_url ||
            item?.thumbnail_src ||
            "";
          const takenAt = post?.taken_at || item?.taken_at;
          const publishedAt = takenAt
            ? new Date(typeof takenAt === "number" ? takenAt * 1000 : takenAt).toISOString()
            : new Date().toISOString();

          let storedImageUrl: string | null = null;
          if (imageUrl) {
            storedImageUrl = await downloadImageToStorage(imageUrl, "instagram", shortcode);
            if (!storedImageUrl) {
              accountResult.errors.push(`IMG_FAIL ${shortcode}: download/upload failed for ${String(imageUrl).slice(0, 80)}`);
            }
          }

          const { error: insertError } = await supabase.from("posts").insert({
            source: "instagram",
            source_id: shortcode,
            account: username,
            caption: typeof caption === "string" ? caption.slice(0, 2000) : "",
            image_url: storedImageUrl || null, // Only use Supabase URL, never CDN
            published_at: publishedAt,
            metadata: {
              likes: post?.like_count || item?.like_count || 0,
              comments: post?.comment_count || item?.comment_count || 0,
            },
          });

          if (insertError) {
            accountResult.errors.push(`Insert ${shortcode}: ${insertError.message}`);
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

  const totalAdded = Object.values(results).reduce((sum, r) => sum + r.added, 0);
  await supabase.from("scrape_log").insert({
    source: "instagram",
    items_added: totalAdded,
    metadata: results,
  });

  return NextResponse.json({ success: true, results });
}
