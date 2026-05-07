import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { updateContactPhone } from "@/lib/ortto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await auth.protect();
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

    await updateContactPhone(contactId, phone);
    return NextResponse.json({ saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
