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

const V2_BASE = "https://app.fullenrich.com/api/v2";

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

// ---------------------------------------------------------------------------
// v2: Contact enrichment by LinkedIn URL → phone numbers.
// Used by /api/marketing-contact/enrich-phone/* to populate phn::phone.
// ---------------------------------------------------------------------------

async function feFetchV2(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<unknown> {
  const res = await fetch(`${V2_BASE}${path}`, {
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

export type ContactEnrichmentResult = {
  status: string;
  phone: string | null;
};

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export async function startContactEnrichmentByLinkedIn(
  linkedinUrl: string
): Promise<{ enrichmentId: string }> {
  const data = (await feFetchV2("/contact/enrich/bulk", {
    method: "POST",
    body: {
      name: `phone-lookup-${Date.now()}`,
      data: [
        {
          linkedin_url: linkedinUrl,
          enrich_fields: ["contact.phones"],
        },
      ],
    },
  })) as { enrichment_id?: string };

  if (!data.enrichment_id || typeof data.enrichment_id !== "string") {
    throw new Error("FullEnrich did not return enrichment_id");
  }
  return { enrichmentId: data.enrichment_id };
}

type RawV2ContactInfo = {
  most_probable_phone?: { number?: string };
  phones?: Array<{ number?: string }>;
};

type RawV2Datum = { contact_info?: RawV2ContactInfo };

type RawV2Response = {
  status?: string;
  data?: RawV2Datum[];
};

export async function getContactEnrichmentResult(
  id: string
): Promise<ContactEnrichmentResult> {
  const data = (await feFetchV2(`/contact/enrich/bulk/${id}`, {
    method: "GET",
  })) as RawV2Response;

  const status = data.status || "UNKNOWN";
  const ci = data.data?.[0]?.contact_info;
  const rawNumber =
    ci?.most_probable_phone?.number || ci?.phones?.[0]?.number || null;
  const phone = rawNumber ? normalizePhone(rawNumber) : null;

  return { status, phone };
}
