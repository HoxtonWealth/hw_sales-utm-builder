import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabase();

    const { data: emails, error } = await supabase
      .from("emails")
      .select("*")
      .order("sent_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Read lastSynced from the latest scrape_log row scoped to ortto, so a
    // blog/instagram/linkedin run doesn't wrongly mark emails as just synced.
    const { data: latestLog } = await supabase
      .from("scrape_log")
      .select("created_at")
      .eq("source", "ortto")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json(
      { emails: emails ?? [], lastSynced: latestLog?.created_at ?? null },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}
