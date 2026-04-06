import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );

  // Add video_url column to posts table
  console.log("Adding video_url column to posts table...");
  const { error } = await supabase.rpc("exec_sql", {
    query: `ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url text;`,
  });

  if (error) {
    console.error("Could not add column automatically.");
    console.error("Run this SQL in Supabase SQL Editor:");
    console.error("  ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url text;");
  } else {
    console.log("✓ video_url column added");
  }
}

main().catch(console.error);
