import { NextRequest, NextResponse } from "next/server";
import { getDefaultScId, saveDefaultScId } from "@/lib/kv";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scId = await getDefaultScId();
    return NextResponse.json({ value: scId });
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
    const { value } = await request.json();

    if (!value || typeof value !== "string") {
      return NextResponse.json(
        { error: "Value is required" },
        { status: 400 }
      );
    }

    await saveDefaultScId(value);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
