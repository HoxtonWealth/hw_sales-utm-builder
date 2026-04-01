import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.SHORT_IO_API_KEY;
    const domain = process.env.SHORT_IO_DOMAIN;

    if (!apiKey || !domain) {
      return NextResponse.json(
        { error: "Short.io is not configured" },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.short.io/links", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain,
        originalURL: url,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error("Short.io error:", response.status, errorData);
      return NextResponse.json(
        { error: "Failed to shorten URL" },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json({ shortUrl: data.shortURL });
  } catch {
    return NextResponse.json(
      { error: "Failed to shorten URL" },
      { status: 500 }
    );
  }
}
