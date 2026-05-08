import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { startContactEnrichmentByLinkedIn } from "@/lib/fullenrich";
import { peekPhoneEnrichQuota } from "@/lib/marketing-contact/quota";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { userId } = await auth.protect();
  try {
    const { linkedinUrl } = await request.json();

    if (!linkedinUrl || typeof linkedinUrl !== "string") {
      return NextResponse.json(
        { error: "linkedinUrl is required" },
        { status: 400 }
      );
    }

    // Refuse early if the user is already at their daily cap, so we don't
    // burn a FullEnrich credit on a job whose result we'll have to discard.
    const quota = await peekPhoneEnrichQuota(userId);
    if (quota.remaining <= 0) {
      return NextResponse.json(
        {
          error: `Daily limit reached (${quota.limit} phone enrichments per day). Try again tomorrow.`,
          quotaExceeded: true,
          quota,
        },
        { status: 429 }
      );
    }

    const { enrichmentId } = await startContactEnrichmentByLinkedIn(linkedinUrl);
    return NextResponse.json({ enrichmentId, quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
