import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { startContactEnrichmentByLinkedIn } from "@/lib/fullenrich";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await auth.protect();
  try {
    const { linkedinUrl } = await request.json();

    if (!linkedinUrl || typeof linkedinUrl !== "string") {
      return NextResponse.json(
        { error: "linkedinUrl is required" },
        { status: 400 }
      );
    }

    const { enrichmentId } = await startContactEnrichmentByLinkedIn(linkedinUrl);
    return NextResponse.json({ enrichmentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
