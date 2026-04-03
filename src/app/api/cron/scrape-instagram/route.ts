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

  if (!res.ok) {
    throw new Error(`RapidAPI ${endpoint} returned ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function getUserId(username: string): Promise<string> {
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("ig_accounts")
    .select("user_id")
    .eq("username", username)
    .single();

  if (existing?.user_id) return existing.user_id;

  // Fetch profile from RapidAPI
  const profile = await rapidApiFetch("/profile", { username });

  // ADJUST: field name may differ
  const userId = String(profile?.data?.id || profile?.id || profile?.user?.pk || profile?.pk);

  if (!userId || userId === "undefined") {
    throw new Error(`Could not resolve user_id for @${username}`);
  }

  await supabase
    .from("ig_accounts")
    .upsert({ username, user_id: userId }, { onConflict: "username" });

  return userId;
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
    const ext = contentType.includes("png") ? "png" : "jpg";
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

  const accounts = (process.env.IG_ACCOUNTS || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (accounts.length === 0) {
    return NextResponse.json({ error: "No IG_ACCOUNTS configured" }, { status: 400 });
  }

  const results: Record<string, { added: number; errors: string[] }> = {};

  for (const username of accounts) {
    const accountResult = { added: 0, errors: [] as string[] };
    results[username] = accountResult;

    try {
      const userId = await getUserId(username);

      // ADJUST: field name may differ
      const mediaResponse = await rapidApiFetch("/user-media", { user_id: userId });
      const items = mediaResponse?.data?.items || mediaResponse?.items || mediaResponse?.data || [];

      if (!Array.isArray(items)) {
        accountResult.errors.push("Unexpected media response format");
        continue;
      }

      // Get existing source_ids to filter duplicates
      const shortcodes = items
        .map((item: Record<string, unknown>) =>
          // ADJUST: field name may differ
          String(item.code || item.shortcode || "")
        )
        .filter(Boolean);

      const { data: existing } = await supabase
        .from("posts")
        .select("source_id")
        .eq("source", "instagram")
        .in("source_id", shortcodes);

      const existingIds = new Set((existing ?? []).map((e) => e.source_id));

      for (const item of items) {
        // ADJUST: field name may differ
        const shortcode = String(item.code || item.shortcode || "");
        if (!shortcode || existingIds.has(shortcode)) continue;

        try {
          // ADJUST: field name may differ
          const postDetail = await rapidApiFetch("/post", { code: shortcode });
          const post = postDetail?.data || postDetail;

          // ADJUST: field names may differ
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
            "";
          const takenAt = post?.taken_at || item?.taken_at;
          const publishedAt = takenAt
            ? new Date(typeof takenAt === "number" ? takenAt * 1000 : takenAt).toISOString()
            : new Date().toISOString();

          let storedImageUrl: string | null = null;
          if (imageUrl) {
            storedImageUrl = await downloadImageToStorage(imageUrl, "instagram", shortcode);
          }

          const { error: insertError } = await supabase.from("posts").insert({
            source: "instagram",
            source_id: shortcode,
            account: username,
            caption: caption.slice(0, 2000),
            image_url: storedImageUrl || imageUrl || null,
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
