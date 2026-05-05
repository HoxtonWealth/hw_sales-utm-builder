import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;
const PROCESS_LIMIT = 50;
const PRUNE_SAFETY_MIN = 3;

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

function extractMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${property}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractSlug(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || "";
  } catch {
    return "";
  }
}

async function downloadImageToStorage(
  imageUrl: string,
  folder: string,
  filename: string
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const res = await fetch(imageUrl);
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const path = `${folder}/${filename}.${ext}`;

    const { error } = await supabase.storage
      .from("post-images")
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      console.error("Storage upload error:", error.message);
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
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let added = 0;
  let pruned = 0;
  let skippedStale = 0;
  let skippedNoDate = 0;
  const validSlugs = new Set<string>();
  const errors: string[] = [];

  try {
    const sitemapRes = await fetch("https://hoxtonwealth.com/sitemap-blogs.xml");
    if (!sitemapRes.ok) {
      return NextResponse.json(
        { error: `Sitemap fetch failed: ${sitemapRes.status}` },
        { status: 500 }
      );
    }

    const xml = await sitemapRes.text();

    const locMatches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
    const blogUrls = locMatches
      .map((loc) => loc.replace(/<\/?loc>/g, ""))
      .filter((url) => url.includes("/blog/"))
      .slice(0, PROCESS_LIMIT);

    for (const articleUrl of blogUrls) {
      const slug = extractSlug(articleUrl);
      if (!slug) continue;

      try {
        const pageRes = await fetch(articleUrl);
        if (!pageRes.ok) {
          errors.push(`Fetch ${slug}: ${pageRes.status}`);
          continue;
        }

        const html = await pageRes.text();

        const dateStr =
          extractMetaContent(html, "article:published_time") ||
          extractMetaContent(html, "article:modified_time");

        if (!dateStr) {
          skippedNoDate++;
          continue;
        }

        const publishedAt = new Date(dateStr);
        if (isNaN(publishedAt.getTime())) {
          errors.push(`Bad date for ${slug}: ${dateStr}`);
          continue;
        }

        if (publishedAt < cutoff) {
          skippedStale++;
          continue;
        }

        const title = extractMetaContent(html, "og:title") || slug;
        const description = extractMetaContent(html, "og:description") || "";
        const ogImage = extractMetaContent(html, "og:image") || "";

        let storedImageUrl: string | null = null;
        if (ogImage) {
          storedImageUrl = await downloadImageToStorage(ogImage, "blog", slug);
        }

        const { error: upsertError } = await supabase.from("posts").upsert(
          {
            source: "blog",
            source_id: slug,
            account: "hoxtonwealth.com",
            caption: description.slice(0, 2000),
            image_url: storedImageUrl || ogImage || null,
            published_at: publishedAt.toISOString(),
            metadata: {
              title,
              url: articleUrl,
            },
          },
          { onConflict: "source_id" }
        );

        if (upsertError) {
          errors.push(`Upsert ${slug}: ${upsertError.message}`);
        } else {
          added++;
          validSlugs.add(slug);
        }
      } catch (err) {
        errors.push(
          `${slug}: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }

    if (validSlugs.size >= PRUNE_SAFETY_MIN) {
      const { data: existing } = await supabase
        .from("posts")
        .select("source_id")
        .eq("source", "blog");

      const toDelete = (existing ?? [])
        .map((r) => r.source_id as string)
        .filter((sid) => !validSlugs.has(sid));

      for (let i = 0; i < toDelete.length; i += 100) {
        const chunk = toDelete.slice(i, i + 100);
        const { error: pruneError } = await supabase
          .from("posts")
          .delete()
          .eq("source", "blog")
          .in("source_id", chunk);

        if (pruneError) {
          errors.push(`Prune: ${pruneError.message}`);
          break;
        }
        pruned += chunk.length;
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "unknown error");
  }

  await supabase.from("scrape_log").insert({
    source: "blog",
    items_added: added,
    metadata: { errors, pruned, skipped_stale: skippedStale, skipped_no_date: skippedNoDate },
  });

  return NextResponse.json({
    success: true,
    added,
    pruned,
    skipped_stale: skippedStale,
    skipped_no_date: skippedNoDate,
    errors,
  });
}
