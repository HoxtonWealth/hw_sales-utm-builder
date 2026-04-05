import { kv } from "@vercel/kv";
import { Rep } from "./types";

export async function getReps(): Promise<Rep[]> {
  const reps = await kv.get<Rep[]>("reps");
  return reps ?? [];
}

export async function saveReps(reps: Rep[]): Promise<void> {
  await kv.set("reps", reps);
}

export async function getDefaultScId(): Promise<string> {
  const scId = await kv.get<string>("default_sc_id");
  return scId ?? "SC_DEFAULT_001";
}

export async function saveDefaultScId(scId: string): Promise<void> {
  await kv.set("default_sc_id", scId);
}

export async function getAiPrompt(): Promise<string> {
  const prompt = await kv.get<string>("ai_prompt");
  return prompt ?? "";
}

export async function saveAiPrompt(prompt: string): Promise<void> {
  await kv.set("ai_prompt", prompt);
}
