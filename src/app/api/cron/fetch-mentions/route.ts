import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAllMentions } from "@/lib/mentions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  try {
    const results = await fetchAllMentions(supabase);
    const totalAdded = results.coveragebook.added + results.google_alerts.added;

    await supabase.from("scrape_log").insert({
      source: "mentions",
      items_added: totalAdded,
      metadata: results,
    });

    return NextResponse.json({ success: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await supabase.from("scrape_log").insert({
      source: "mentions",
      items_added: 0,
      metadata: { fatal: message },
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
