import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { startReverseEmailLookup } from "@/lib/fullenrich";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await auth.protect();
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    const { enrichmentId } = await startReverseEmailLookup(email);
    return NextResponse.json({ enrichmentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
