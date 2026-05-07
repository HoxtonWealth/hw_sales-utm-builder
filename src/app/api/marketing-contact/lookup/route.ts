import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { detectInputType } from "@/lib/marketing-contact/utils";
import {
  lookupContactById,
  lookupContactByEmail,
  lookupContactByHxtId,
} from "@/lib/ortto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await auth.protect();
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    const inputType = detectInputType(query.trim());
    let contact = null;

    switch (inputType) {
      case "email":
        contact = await lookupContactByEmail(query.trim());
        break;
      case "hxt_id":
        contact = await lookupContactByHxtId(query.trim());
        break;
      case "ortto_id":
        contact = await lookupContactById(query.trim());
        break;
    }

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ contact, inputType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
