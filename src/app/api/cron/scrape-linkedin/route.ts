import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RAPIDAPI_HOST = "linkedin-data-api.p.rapidapi.com";

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

// Pick the best image URL from the images array (highest resolution first image)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickBestImage(post: Record<string, any>): string | null {
  // images is grouped by image: images[0] = array of resolutions for first image
  const grouped = post.images;
  if (Array.isArray(grouped) && grouped.length > 0 && Array.isArray(grouped[0])) {
    // Pick highest-width from first image
    const sorted = [...grouped[0]]
      .filter((img) => img?.url && img?.width)
      .sort((a, b) => (b.width || 0) - (a.width || 0));
    if (sorted.length > 0) return sorted[0].url;
  }

  // Fallback to flat image array
  const flat = post.image;
  if (Array.isArray(flat) && flat.length > 0) {
    const sorted = [...flat]
      .filter((img) => img?.url && img?.width)
      .sort((a, b) => (b.width || 0) - (a.width || 0));
    if (sorted.length > 0) return sorted[0].url;
  }

  // Article thumbnail
  if (post.article?.smallImage?.[0]?.url) {
    return post.article.smallImage[0].url;
  }

  // Video poster
  if (Array.isArray(post.video) && post.video[0]?.poster) {
    return post.video[0].poster;
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

  // Delete all existing LinkedIn posts for clean re-sync
  const { error: deleteErr } = await supabase.from("posts").delete().eq("source", "linkedin");
  if (deleteErr) {
    return NextResponse.json({ error: `Cleanup failed: ${deleteErr.message}` }, { status: 500 });
  }

  const results: Record<string, { added: number; errors: string[]; debug?: string }> = {};

  for (const username of accounts) {
    const accountResult: { added: number; errors: string[]; debug?: string } = { added: 0, errors: [] };
    results[username] = accountResult;

    try {
      const response = await rapidApiFetch("/get-company-posts", { username });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = response as Record<string, any>;

      if (!r.success) {
        accountResult.errors.push(`API returned success=false: ${r.message || "unknown"}`);
        continue;
      }

      const posts = r.data;
      if (!Array.isArray(posts) || posts.length === 0) {
        accountResult.errors.push("No posts returned from API");
        continue;
      }

      accountResult.debug = `total=${r.total}, posts_in_page=${posts.length}`;

      for (const post of posts) {
        // Skip reposts — only capture original content
        if (post.reposted) continue;

        const urn = String(post.urn || "");
        if (!urn) continue;

        try {
          const caption = String(post.text || "").slice(0, 2000);
          const contentType = String(post.contentType || "text");

          // Published date
          const publishedAt = post.postedDateTimestamp
            ? new Date(post.postedDateTimestamp).toISOString()
            : post.postedDate
              ? new Date(post.postedDate).toISOString()
              : new Date().toISOString();

          // Image — download to Supabase Storage
          const bestImageUrl = pickBestImage(post);
          let finalImageUrl: string | null = null;
          if (bestImageUrl) {
            const stored = await downloadToStorage(bestImageUrl, "post-images", "linkedin", urn);
            finalImageUrl = stored || bestImageUrl;
          }

          // Video
          const finalVideoUrl: string | null =
            contentType === "linkedInVideo" && Array.isArray(post.video) && post.video[0]?.url
              ? post.video[0].url
              : null;

          const insertData = {
            source: "linkedin" as const,
            source_id: urn,
            account: username,
            caption,
            image_url: finalImageUrl,
            video_url: finalVideoUrl,
            published_at: publishedAt,
            metadata: {
              content_type: contentType,
              reactions: post.totalReactionCount || 0,
              likes: post.likeCount || 0,
              comments: post.commentsCount || 0,
              reposts: post.repostsCount || 0,
              post_url: post.postUrl || null,
              share_url: post.shareUrl || null,
              article: contentType === "article" ? post.article || null : null,
            },
          };

          const { error: insertError } = await supabase.from("posts").insert(insertData);

          if (insertError) {
            accountResult.errors.push(`Insert ${urn}: ${insertError.message}`);
          } else {
            accountResult.added++;
          }
        } catch (postErr) {
          accountResult.errors.push(
            `Post ${urn}: ${postErr instanceof Error ? postErr.message : "unknown error"}`
          );
        }
      }
    } catch (err) {
      accountResult.errors.push(err instanceof Error ? err.message : "unknown error");
    }
  }

  const totalAdded = Object.values(results).reduce((sum, r) => sum + r.added, 0);
  await supabase.from("scrape_log").insert({
    source: "linkedin",
    items_added: totalAdded,
    metadata: results,
  });

  return NextResponse.json({ success: true, results });
}
