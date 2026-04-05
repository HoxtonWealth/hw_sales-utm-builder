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
      // Probe API root to discover endpoints (logged for debugging)
      try {
        const probeRes = await fetch(`https://${RAPIDAPI_HOST}/`, {
          headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": process.env.RAPIDAPI_KEY! },
        });
        const probeText = await probeRes.text();
        console.log(`Instagram API root (${probeRes.status}): ${probeText.slice(0, 500)}`);
      } catch (probeErr) {
        console.log("Instagram API root probe failed:", probeErr);
      }

      const userId = await getUserId(username);

      // Try multiple endpoint + param combos — RapidAPI Instagram scrapers vary
      let mediaResponse: Record<string, unknown> | null = null;
      const mediaAttempts: { ep: string; params: Record<string, string> }[] = [
        { ep: "/user-medias", params: { user_id: userId } },
        { ep: "/user-medias", params: { username } },
        { ep: "/user-posts", params: { user_id: userId } },
        { ep: "/user-posts", params: { username } },
        { ep: "/user-feed", params: { user_id: userId } },
        { ep: "/user-feed", params: { username } },
        { ep: "/media", params: { user_id: userId } },
        { ep: "/posts", params: { user_id: userId } },
        { ep: "/get-user-medias", params: { username } },
        { ep: "/v1/user-medias", params: { username } },
      ];
      const triedEndpoints: string[] = [];
      for (const { ep, params } of mediaAttempts) {
        try {
          triedEndpoints.push(`${ep}(${Object.keys(params).join(",")})`);
          mediaResponse = await rapidApiFetch(ep, params);
          console.log(`Instagram: working endpoint = ${ep} with params ${JSON.stringify(params)}`);
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          console.log(`Instagram: ${ep} failed: ${msg.slice(0, 200)}`);
          if (msg.includes("404") || msg.includes("does not exist")) continue;
          throw e;
        }
      }
      if (!mediaResponse) {
        accountResult.errors.push("No working media endpoint found. Tried: " + triedEndpoints.join(", "));
        continue;
      }
      // ADJUST: field name may differ
      const items = (mediaResponse?.data as Record<string, unknown>)?.items || mediaResponse?.items || mediaResponse?.data || [];

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
          // Try multiple post detail endpoints
          let postDetail: Record<string, unknown> | null = null;
          const postEndpoints = ["/post", "/post-info", "/media-info"];
          for (const ep of postEndpoints) {
            try {
              postDetail = await rapidApiFetch(ep, { code: shortcode });
              break;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "";
              if (msg.includes("404") || msg.includes("does not exist")) continue;
              throw e;
            }
          }
          const post: Record<string, unknown> = (postDetail?.data || postDetail || {}) as Record<string, unknown>;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = post as Record<string, any>; // ADJUST: field names may differ
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const it = item as Record<string, any>;
          const caption =
            p?.caption?.text ||
            p?.edge_media_to_caption?.edges?.[0]?.node?.text ||
            it?.caption?.text ||
            "";
          const imageUrl =
            p?.image_versions2?.candidates?.[0]?.url ||
            p?.display_url ||
            p?.thumbnail_src ||
            it?.image_versions2?.candidates?.[0]?.url ||
            it?.display_url ||
            "";
          const takenAt = p?.taken_at || it?.taken_at;
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
              likes: p?.like_count || it?.like_count || 0,
              comments: p?.comment_count || it?.comment_count || 0,
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
