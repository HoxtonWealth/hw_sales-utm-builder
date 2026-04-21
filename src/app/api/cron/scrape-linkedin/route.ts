import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HARVEST_HOST = "api.harvest-api.com";
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

async function harvestFetch(endpoint: string, params: Record<string, string>) {
  const url = new URL(`https://${HARVEST_HOST}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      "X-API-Key": process.env.HARVEST_API_KEY!,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Harvest ${endpoint} returned ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}

async function downloadToStorage(
  mediaUrl: string,
  bucket: string,
  folder: string,
  filename: string
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const res = await fetch(mediaUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`Image fetch failed [${res.status}] for ${mediaUrl.slice(0, 80)}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const path = `${folder}/${filename}.${ext}`;

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
      console.error(`Storage upload error [${path}]: ${error.message}`);
      return null;
    }

    const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl.publicUrl;
  } catch (err) {
    console.error("Image download error:", err);
    return null;
  }
}

// Harvest returns postImages as a flat array of {url, width, height, expiresAt}.
// Pick the highest-width image; fall back to article preview or video thumbnail.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickBestImage(post: Record<string, any>): string | null {
  const images = post.postImages;
  if (Array.isArray(images) && images.length > 0) {
    const sorted = [...images]
      .filter((img) => img?.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0));
    if (sorted.length > 0) return sorted[0].url;
  }

  if (post.article?.image?.url) {
    return post.article.image.url;
  }

  if (post.postVideo?.thumbnailUrl) {
    return post.postVideo.thumbnailUrl;
  }

  return null;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  const accounts = (process.env.LI_ACCOUNTS || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (accounts.length === 0) {
    return NextResponse.json({ error: "No LI_ACCOUNTS configured" }, { status: 400 });
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
      const response = await harvestFetch("/linkedin/company-posts", {
        companyUniversalName: username,
        postedLimit: "month",
        page: "1",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = response as Record<string, any>;

      if (r.error) {
        accountResult.errors.push(`API error: ${typeof r.error === "string" ? r.error : JSON.stringify(r.error)}`);
        continue;
      }

      const posts = Array.isArray(r.elements) ? r.elements : [];
      if (posts.length === 0) {
        accountResult.errors.push("No posts returned from API");
        continue;
      }

      accountResult.debug = `total=${r.pagination?.totalElements ?? "?"}, posts_in_page=${posts.length}`;

      // Skip only posts that already have a known-good storage URL. Posts
      // with NULL/CDN image_urls are re-processed so failed image uploads
      // from a previous run get retried automatically.
      const { data: existing, error: existingErr } = await supabase
        .from("posts")
        .select("source_id, image_url")
        .eq("source", "linkedin")
        .eq("account", username);

      if (existingErr) {
        accountResult.errors.push(`dedupe query: ${existingErr.message}`);
      }

      const goodIds = new Set(
        (existing ?? [])
          .filter((e) => (e.image_url || "").includes("/storage/v1/object/public/post-images/"))
          .map((e) => e.source_id)
      );
      accountResult.debug += ` | total_in_db=${(existing ?? []).length} | with_storage=${goodIds.size}`;

      for (const post of posts) {
        // Skip reposts — only capture original content
        if (post.repostId || post.repostedBy) continue;

        const id = String(post.id || "");
        if (!id || goodIds.has(id)) continue;

        try {
          const caption = String(post.content || "").slice(0, 2000);

          const publishedAtMs = post.postedAt?.timestamp
            ? Number(post.postedAt.timestamp)
            : post.postedAt?.date
              ? new Date(post.postedAt.date).getTime()
              : Date.now();
          const publishedAt = new Date(publishedAtMs).toISOString();

          // Skip items already outside the retention window — they'd just get
          // pruned at the end of the run, so don't waste an image download.
          if (publishedAtMs < retentionCutoffMs) {
            continue;
          }

          // Derive a content type from which fields are populated (Harvest
          // doesn't expose an explicit enum the way the old API did).
          const hasVideo = !!post.postVideo?.videoUrl;
          const hasArticle = !!post.article;
          const hasImage = Array.isArray(post.postImages) && post.postImages.length > 0;
          const contentType = hasVideo
            ? "video"
            : hasArticle
              ? "article"
              : hasImage
                ? "image"
                : "text";

          const bestImageUrl = pickBestImage(post);
          let finalImageUrl: string | null = null;
          if (bestImageUrl) {
            const stored = await downloadToStorage(bestImageUrl, "post-images", "linkedin", id);
            finalImageUrl = stored || bestImageUrl;
          }

          const finalVideoUrl: string | null = hasVideo ? post.postVideo.videoUrl : null;

          const insertData = {
            source: "linkedin" as const,
            source_id: id,
            account: username,
            caption,
            image_url: finalImageUrl,
            video_url: finalVideoUrl,
            published_at: publishedAt,
            metadata: {
              content_type: contentType,
              likes: post.likes ?? post.engagement?.likes ?? 0,
              comments: post.comments ?? post.engagement?.comments ?? 0,
              shares: post.shares ?? post.engagement?.shares ?? 0,
              post_url: post.linkedinUrl || null,
              article: hasArticle ? post.article : null,
            },
          };

          const { error: insertError } = await supabase
            .from("posts")
            .upsert(insertData, { onConflict: "source_id" });

          if (insertError) {
            accountResult.errors.push(`Upsert ${id}: ${insertError.message}`);
          } else {
            accountResult.added++;
          }
        } catch (postErr) {
          accountResult.errors.push(
            `Post ${post?.id ?? "?"}: ${postErr instanceof Error ? postErr.message : "unknown error"}`
          );
        }
      }
    } catch (err) {
      accountResult.errors.push(err instanceof Error ? err.message : "unknown error");
    }
  }

  // Prune posts older than the retention window (uses the cutoff computed
  // at the top of the request so it matches the per-item pre-filter).
  const { count: prunedCount, error: pruneErr } = await supabase
    .from("posts")
    .delete({ count: "exact" })
    .eq("source", "linkedin")
    .lt("published_at", retentionCutoffIso);

  const totalAdded = Object.values(results).reduce((sum, r) => sum + r.added, 0);
  await supabase.from("scrape_log").insert({
    source: "linkedin",
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
