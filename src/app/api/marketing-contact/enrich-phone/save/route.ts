import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { updateContactPhone } from "@/lib/ortto";
import {
  consumePhoneEnrichQuota,
  releasePhoneEnrichQuota,
} from "@/lib/marketing-contact/quota";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { userId } = await auth.protect();
  try {
    const { contactId, phone } = await request.json();

    if (!contactId || typeof contactId !== "string") {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }
    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400 }
      );
    }

    const quota = await consumePhoneEnrichQuota(userId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: `Daily limit reached (${quota.limit} phone enrichments per day). Try again tomorrow.`,
          quotaExceeded: true,
          quota,
        },
        { status: 429 }
      );
    }

    try {
      await updateContactPhone(contactId, phone);
    } catch (e) {
      await releasePhoneEnrichQuota(userId);
      throw e;
    }
    return NextResponse.json({ saved: true, quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
