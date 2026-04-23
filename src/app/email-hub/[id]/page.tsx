import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export default async function EmailPreviewPage({ params }: Params) {
  const supabase = getSupabase();
  const { data: email, error } = await supabase
    .from("emails")
    .select("body_html, subject")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !email) {
    notFound();
  }

  return (
    <div style={{ background: "white", minHeight: "100vh", padding: "24px 0" }}>
      <div
        style={{ maxWidth: 600, margin: "0 auto" }}
        dangerouslySetInnerHTML={{ __html: email.body_html }}
      />
    </div>
  );
}
