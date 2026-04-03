import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  let added = 0;
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
      .filter((url) => url.includes("/blog/"));

    const slugs = blogUrls.map(extractSlug).filter(Boolean);

    const { data: existingPosts } = await supabase
      .from("posts")
      .select("source_id")
      .eq("source", "blog")
      .in("source_id", slugs);

    const existingSlugs = new Set((existingPosts ?? []).map((p) => p.source_id));

    const newUrls = blogUrls.filter((url) => {
      const slug = extractSlug(url);
      return slug && !existingSlugs.has(slug);
    });

    const toProcess = newUrls.slice(0, 10);

    for (const articleUrl of toProcess) {
      const slug = extractSlug(articleUrl);
      if (!slug) continue;

      try {
        const pageRes = await fetch(articleUrl);
        if (!pageRes.ok) {
          errors.push(`Fetch ${slug}: ${pageRes.status}`);
          continue;
        }

        const html = await pageRes.text();

        const title = extractMetaContent(html, "og:title") || slug;
        const description = extractMetaContent(html, "og:description") || "";
        const ogImage = extractMetaContent(html, "og:image") || "";
        const publishedTime = extractMetaContent(html, "article:published_time");

        const publishedAt = publishedTime
          ? new Date(publishedTime).toISOString()
          : new Date().toISOString();

        let storedImageUrl: string | null = null;
        if (ogImage) {
          storedImageUrl = await downloadImageToStorage(ogImage, "blog", slug);
        }

        const { error: insertError } = await supabase.from("posts").insert({
          source: "blog",
          source_id: slug,
          account: "hoxtonwealth.com",
          caption: description.slice(0, 2000),
          image_url: storedImageUrl || ogImage || null,
          published_at: publishedAt,
          metadata: {
            title,
            url: articleUrl,
          },
        });

        if (insertError) {
          errors.push(`Insert ${slug}: ${insertError.message}`);
        } else {
          added++;
        }
      } catch (err) {
        errors.push(
          `${slug}: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "unknown error");
  }

  await supabase.from("scrape_log").insert({
    source: "blog",
    items_added: added,
    metadata: { errors },
  });

  return NextResponse.json({ success: true, added, errors });
}
