import { getSupabase } from "@/lib/supabase";
import type { Asset } from "@/lib/types";

const SELECT = "id, title, url, description, tags, shareable, created_at, updated_at";

export async function listAssets(): Promise<Asset[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("assets")
    .select(SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Asset[];
}

export type CreateAssetInput = {
  title: string;
  url: string;
  description?: string | null;
  tags: string[];
  shareable: boolean;
};

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      title: input.title,
      url: input.url,
      description: input.description ?? null,
      tags: input.tags,
      shareable: input.shareable,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as Asset;
}

export type UpdateAssetInput = Partial<Omit<CreateAssetInput, "tags">> & {
  tags?: string[];
};

export async function updateAsset(id: string, input: UpdateAssetInput): Promise<Asset> {
  const supabase = getSupabase();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.url !== undefined) updates.url = input.url;
  if (input.description !== undefined) updates.description = input.description;
  if (input.tags !== undefined) updates.tags = input.tags;
  if (input.shareable !== undefined) updates.shareable = input.shareable;

  const { data, error } = await supabase
    .from("assets")
    .update(updates)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as Asset;
}

export async function deleteAsset(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
