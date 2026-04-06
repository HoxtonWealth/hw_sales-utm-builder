import { NextRequest, NextResponse } from "next/server";
import { getAiPrompt } from "@/lib/kv";

export const dynamic = "force-dynamic";

const DEFAULT_SYSTEM_PROMPT =
  "You are a social media copywriter for Hoxton Wealth, a financial advisory firm. Write engaging, professional content to help sales reps share articles and posts with their network.";

export async function POST(request: NextRequest) {
  try {
    const { title, caption, source, platform } = await request.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI generation is not configured (OPENROUTER_API_KEY missing)" },
        { status: 500 }
      );
    }

    const customPrompt = await getAiPrompt();
    const systemPrompt = customPrompt || DEFAULT_SYSTEM_PROMPT;

    const contentDesc =
      source === "blog"
        ? `Blog article titled "${title || "Untitled"}". Description: ${caption || "No description."}`
        : source === "linkedin"
          ? `LinkedIn post by ${title || "unknown"}. Content: ${caption || "No content."}`
          : `Instagram post by @${title || "unknown"}. Caption: ${caption || "No caption."}`;

    const platformGuide =
      platform === "email"
        ? "Write a short, professional email snippet (2-3 sentences) to share this content with a prospect. Keep it warm and personal."
        : "Write a LinkedIn post (3-5 sentences) to share this content. Be professional but engaging. Use line breaks for readability. Do not use hashtags.";

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4.5",
        max_tokens: 512,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate a repost for the following content.\n\n${contentDesc}\n\n${platformGuide}\n\nReturn ONLY the post text, no quotes or labels.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenRouter API error:", res.status, errText);
      return NextResponse.json(
        { error: "AI generation failed" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const generatedText =
      data?.choices?.[0]?.message?.content || "Could not generate post.";

    return NextResponse.json({ text: generatedText });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate post" },
      { status: 500 }
    );
  }
}
