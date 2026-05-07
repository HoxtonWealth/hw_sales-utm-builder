import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getContactEnrichmentResult } from "@/lib/fullenrich";
import { updateContactPhone } from "@/lib/ortto";

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
    const existingPhone = searchParams.get("existingPhone") || "";

    const { status, phone } = await getContactEnrichmentResult(id);

    let saved = false;
    let conflictsWithExisting = false;

    if (status === "FINISHED" && phone) {
      if (existingPhone && existingPhone !== phone) {
        conflictsWithExisting = true;
      } else if (contactId) {
        await updateContactPhone(contactId, phone);
        saved = true;
      }
    }

    return NextResponse.json({
      status,
      phone,
      saved,
      conflictsWithExisting,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
