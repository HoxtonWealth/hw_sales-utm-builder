import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

function isValidUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.trim().length === 0) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("google_alert_feeds")
    .select("id, name, rss_url, active, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ feeds: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const rssUrl = body?.rss_url;
  const active = body?.active !== false;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!isValidUrl(rssUrl)) {
    return NextResponse.json({ error: "rss_url must be a valid http(s) URL" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("google_alert_feeds")
    .insert({ name, rss_url: rssUrl, active })
    .select("id, name, rss_url, active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ feed: data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    updates.name = body.name.trim();
  }
  if (body.rss_url !== undefined) {
    if (!isValidUrl(body.rss_url)) {
      return NextResponse.json({ error: "rss_url must be a valid http(s) URL" }, { status: 400 });
    }
    updates.rss_url = body.rss_url;
  }
  if (body.active !== undefined) {
    updates.active = Boolean(body.active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no updatable fields provided" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("google_alert_feeds")
    .update(updates)
    .eq("id", id)
    .select("id, name, rss_url, active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ feed: data });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("google_alert_feeds").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
