import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");
    // Default high enough to return everything within the 30-day retention
    // window across all sources. The Content Hub fetches once and filters
    // client-side, so a low default (e.g. 50) was crowding out Instagram/
    // LinkedIn posts when blog posts dominate the global date ordering.
    const limit = parseInt(searchParams.get("limit") || "500", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const account = searchParams.get("account");

    const supabase = getSupabase();
    let query = supabase
      .from("posts")
      .select("*")
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (source) {
      query = query.eq("source", source);
    }
    if (account) {
      query = query.eq("account", account);
    }

    const { data: posts, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: latestLog } = await supabase
      .from("scrape_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json(
      { posts: posts ?? [], lastSynced: latestLog?.created_at ?? null },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}
