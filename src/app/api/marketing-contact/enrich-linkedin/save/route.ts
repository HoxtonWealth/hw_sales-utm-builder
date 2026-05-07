import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { updateContactLinkedIn } from "@/lib/ortto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await auth.protect();
  try {
    const { contactId, linkedinUrl } = await request.json();

    if (!contactId || typeof contactId !== "string") {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }
    if (!linkedinUrl || typeof linkedinUrl !== "string") {
      return NextResponse.json(
        { error: "linkedinUrl is required" },
        { status: 400 }
      );
    }

    await updateContactLinkedIn(contactId, linkedinUrl);
    return NextResponse.json({ saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
