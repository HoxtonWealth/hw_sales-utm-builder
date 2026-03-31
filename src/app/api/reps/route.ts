import { NextRequest, NextResponse } from "next/server";
import { getReps, saveReps } from "@/lib/kv";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  try {
    const reps = await getReps();
    return NextResponse.json(reps);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch reps" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, sc_id } = await request.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const reps = await getReps();

    if (reps.some((r) => r.name === name)) {
      return NextResponse.json(
        { error: "Rep already exists" },
        { status: 400 }
      );
    }

    reps.push({ name, sc_id: sc_id || null });
    reps.sort((a, b) => a.name.localeCompare(b.name));
    await saveReps(reps);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to add rep" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { oldName, name, sc_id } = await request.json();

    if (!oldName || !name) {
      return NextResponse.json(
        { error: "oldName and name are required" },
        { status: 400 }
      );
    }

    const reps = await getReps();
    const index = reps.findIndex((r) => r.name === oldName);

    if (index === -1) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    if (oldName !== name && reps.some((r) => r.name === name)) {
      return NextResponse.json(
        { error: "A rep with that name already exists" },
        { status: 400 }
      );
    }

    reps[index] = { name, sc_id: sc_id || null };
    reps.sort((a, b) => a.name.localeCompare(b.name));
    await saveReps(reps);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update rep" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const reps = await getReps();
    const filtered = reps.filter((r) => r.name !== name);

    if (filtered.length === reps.length) {
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }

    await saveReps(filtered);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete rep" },
      { status: 500 }
    );
  }
}
