import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");
  const limitRaw = parseInt(searchParams.get("limit") ?? "200", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;

  const supabase = getSupabase();
  let query = supabase
    .from("mentions")
    .select(
      "id, source, url, title, snippet, published_at, source_feed_id, created_at"
    )
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (source && source !== "all") {
    query = query.eq("source", source);
  }

  const { data, error } = await query;
  if (error) {
    console.error("/api/admin/mentions select error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mentions: data ?? [] });
}
