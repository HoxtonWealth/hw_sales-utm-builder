const POSTHOG_HOST =
  process.env.POSTHOG_QUERY_HOST || "https://eu.posthog.com";

export interface HogQLResult {
  columns: string[];
  results: unknown[][];
}

export class PostHogConfigError extends Error {}

export async function runHogQL(query: string): Promise<HogQLResult> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new PostHogConfigError(
      "POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID env vars are required"
    );
  }

  const res = await fetch(
    `${POSTHOG_HOST}/api/projects/${projectId}/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query },
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `PostHog Query API ${res.status}: ${body.slice(0, 500)}`
    );
  }

  const data = (await res.json()) as {
    columns?: string[];
    results?: unknown[][];
  };

  return {
    columns: data.columns ?? [],
    results: data.results ?? [],
  };
}

export function rowsToObjects<T extends Record<string, unknown>>(
  result: HogQLResult
): T[] {
  return result.results.map((row) => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj as T;
  });
}
