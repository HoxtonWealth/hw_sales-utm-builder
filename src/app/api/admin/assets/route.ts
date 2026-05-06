import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  createAsset,
  deleteAsset,
  listAssets,
  updateAsset,
} from "@/lib/assets";

export const dynamic = "force-dynamic";

function isValidHttpUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.trim().length === 0) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  return Array.from(new Set(cleaned));
}

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const assets = await listAssets();
    return NextResponse.json({ assets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("GET /api/admin/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const url = body?.url;
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  const tags = normalizeTags(body?.tags) ?? [];
  const shareable = Boolean(body?.shareable);

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!isValidHttpUrl(url)) {
    return NextResponse.json(
      { error: "url must be a valid http(s) URL" },
      { status: 400 }
    );
  }

  try {
    const asset = await createAsset({
      title,
      url,
      description: description || null,
      tags,
      shareable,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("POST /api/admin/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: {
    title?: string;
    url?: string;
    description?: string | null;
    tags?: string[];
    shareable?: boolean;
  } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { error: "title must be a non-empty string" },
        { status: 400 }
      );
    }
    updates.title = body.title.trim();
  }
  if (body.url !== undefined) {
    if (!isValidHttpUrl(body.url)) {
      return NextResponse.json(
        { error: "url must be a valid http(s) URL" },
        { status: 400 }
      );
    }
    updates.url = body.url;
  }
  if (body.description !== undefined) {
    updates.description =
      typeof body.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : null;
  }
  if (body.tags !== undefined) {
    const cleaned = normalizeTags(body.tags);
    if (cleaned === null) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
    }
    updates.tags = cleaned;
  }
  if (body.shareable !== undefined) {
    updates.shareable = Boolean(body.shareable);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no updatable fields provided" }, { status: 400 });
  }

  try {
    const asset = await updateAsset(id, updates);
    return NextResponse.json({ asset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("PUT /api/admin/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  try {
    await deleteAsset(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("DELETE /api/admin/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
