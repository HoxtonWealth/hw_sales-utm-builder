import { NextResponse } from "next/server";
import { listAssets } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const assets = await listAssets();
    return NextResponse.json({ assets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch assets";
    console.error("GET /api/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
