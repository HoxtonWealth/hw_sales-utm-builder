import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { title, caption, source, platform } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI generation is not configured" },
        { status: 500 }
      );
    }

    const contentDesc =
      source === "blog"
        ? `Blog article titled "${title || "Untitled"}". Description: ${caption || "No description."}`
        : `Instagram post by @${title || "unknown"}. Caption: ${caption || "No caption."}`;

    const platformGuide =
      platform === "email"
        ? "Write a short, professional email snippet (2-3 sentences) to share this content with a prospect. Keep it warm and personal."
        : "Write a LinkedIn post (3-5 sentences) to share this content. Be professional but engaging. Use line breaks for readability. Do not use hashtags.";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are a social media copywriter for Hoxton Wealth, a financial advisory firm. Generate a repost for the following content.\n\n${contentDesc}\n\n${platformGuide}\n\nReturn ONLY the post text, no quotes or labels.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", res.status, errText);
      return NextResponse.json(
        { error: "AI generation failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const generatedText =
      data?.content?.[0]?.text || "Could not generate post.";

    return NextResponse.json({ text: generatedText });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate post" },
      { status: 500 }
    );
  }
}
