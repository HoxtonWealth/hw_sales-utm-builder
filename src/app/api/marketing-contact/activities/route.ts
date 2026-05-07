import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getContactActivities } from "@/lib/ortto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await auth.protect();
  try {
    const { personId, offset = 0 } = await request.json();

    if (!personId || typeof personId !== "string") {
      return NextResponse.json(
        { error: "personId is required" },
        { status: 400 }
      );
    }

    const result = await getContactActivities(personId, offset);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
