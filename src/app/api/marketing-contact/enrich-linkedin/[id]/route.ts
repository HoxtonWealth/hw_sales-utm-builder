import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getReverseEmailResult } from "@/lib/fullenrich";
import { updateContactLinkedIn } from "@/lib/ortto";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await auth.protect();
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { error: "enrichment id is required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contactId") || "";
    const existingUrl = searchParams.get("existingUrl") || "";

    const { status, linkedinUrl, profile } = await getReverseEmailResult(id);

    let saved = false;
    let conflictsWithExisting = false;

    if (status === "FINISHED" && linkedinUrl) {
      if (existingUrl && existingUrl !== linkedinUrl) {
        conflictsWithExisting = true;
      } else if (contactId) {
        await updateContactLinkedIn(contactId, linkedinUrl);
        saved = true;
      }
    }

    return NextResponse.json({
      status,
      linkedinUrl,
      profile,
      saved,
      conflictsWithExisting,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
