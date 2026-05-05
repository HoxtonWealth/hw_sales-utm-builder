import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAllMentions } from "@/lib/mentions";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  try {
    const results = await fetchAllMentions(supabase);
    const totalAdded = results.coveragebook.added + results.google_alerts.added;

    await supabase.from("scrape_log").insert({
      source: "mentions",
      items_added: totalAdded,
      metadata: { ...results, trigger: "admin" },
    });

    return NextResponse.json({ success: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await supabase.from("scrape_log").insert({
      source: "mentions",
      items_added: 0,
      metadata: { fatal: message, trigger: "admin" },
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
