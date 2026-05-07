/**
 * FullEnrich API client (server-side only — uses FULLENRICH_API_KEY).
 *
 * Reverse-email lookup: takes an email, returns LinkedIn profile if matched.
 * Docs: https://docs.fullenrich.com
 *
 * Used by /api/marketing-contact/enrich-linkedin/* to populate Ortto's
 * str:cm:linkedin-url field on contacts.
 */

export type ProfileSummary = {
  linkedinUrl: string | null;
  headline: string | null;
  companyName: string | null;
};

export type ReverseEmailResult = {
  status: string;
  linkedinUrl: string | null;
  profile: ProfileSummary | null;
};

function getBaseUrl(): string {
  return process.env.FULLENRICH_API_BASE || "https://app.fullenrich.com/api/v1";
}

function getApiKey(): string {
  const key = process.env.FULLENRICH_API_KEY;
  if (!key) throw new Error("FULLENRICH_API_KEY is not set");
  return key;
}

async function feFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `FullEnrich ${init.method} ${path} returned ${res.status}: ${text.slice(0, 500)}`
    );
  }
  return text ? JSON.parse(text) : {};
}

export async function startReverseEmailLookup(
  email: string
): Promise<{ enrichmentId: string }> {
  const data = (await feFetch("/contact/reverse/email/bulk", {
    method: "POST",
    body: {
      name: `linkedin-lookup-${Date.now()}`,
      data: [{ email }],
    },
  })) as { enrichment_id?: string };

  if (!data.enrichment_id || typeof data.enrichment_id !== "string") {
    throw new Error("FullEnrich did not return enrichment_id");
  }
  return { enrichmentId: data.enrichment_id };
}

type RawProfile = {
  linkedin_url?: string;
  headline?: string;
  position?: { title?: string; company?: { name?: string } };
};

type RawDatum = {
  contact?: { profile?: RawProfile };
};

type RawPollResponse = {
  status?: string;
  datas?: RawDatum[];
};

export async function getReverseEmailResult(
  id: string
): Promise<ReverseEmailResult> {
  const data = (await feFetch(`/contact/reverse/email/bulk/${id}`, {
    method: "GET",
  })) as RawPollResponse;

  const status = data.status || "UNKNOWN";
  const profileRaw = data.datas?.[0]?.contact?.profile;

  if (!profileRaw) {
    return { status, linkedinUrl: null, profile: null };
  }

  const linkedinUrl = profileRaw.linkedin_url || null;
  const profile: ProfileSummary = {
    linkedinUrl,
    headline: profileRaw.headline || null,
    companyName: profileRaw.position?.company?.name || null,
  };

  return { status, linkedinUrl, profile };
}
