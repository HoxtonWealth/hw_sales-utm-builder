import { NextRequest, NextResponse } from "next/server";
import { getDefaultScId, saveDefaultScId, getAiPrompt, saveAiPrompt } from "@/lib/kv";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [scId, aiPrompt] = await Promise.all([
      getDefaultScId(),
      getAiPrompt(),
    ]);
    return NextResponse.json({ value: scId, aiPrompt });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Support updating default SC_ID
    if (body.value && typeof body.value === "string") {
      await saveDefaultScId(body.value);
    }

    // Support updating AI prompt
    if (typeof body.aiPrompt === "string") {
      await saveAiPrompt(body.aiPrompt);
    }

    if (!body.value && typeof body.aiPrompt !== "string") {
      return NextResponse.json(
        { error: "No valid field to update" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
