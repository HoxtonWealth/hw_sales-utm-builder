import { kv } from "@vercel/kv";

// Per-user daily cap on successful phone enrichments. Counts only Ortto saves;
// FullEnrich credits used on lookups that returned no phone don't count.
export const PHONE_ENRICH_DAILY_LIMIT = 3;

// 48h covers the longest possible UTC-day spillover safely.
const TTL_SECONDS = 60 * 60 * 48;

function quotaKey(userId: string): string {
  // Reset at UTC midnight. Sales reps are mostly EU/UK so this is "early
  // morning" local time — close enough to a calendar-day reset.
  const today = new Date().toISOString().slice(0, 10);
  return `phone-enrich-quota:${userId}:${today}`;
}

export type QuotaStatus = {
  used: number;
  limit: number;
  remaining: number;
};

export async function peekPhoneEnrichQuota(
  userId: string
): Promise<QuotaStatus> {
  const used = (await kv.get<number>(quotaKey(userId))) || 0;
  return {
    used,
    limit: PHONE_ENRICH_DAILY_LIMIT,
    remaining: Math.max(0, PHONE_ENRICH_DAILY_LIMIT - used),
  };
}

export async function consumePhoneEnrichQuota(
  userId: string
): Promise<QuotaStatus & { allowed: boolean }> {
  const key = quotaKey(userId);
  const newCount = await kv.incr(key);
  if (newCount === 1) {
    await kv.expire(key, TTL_SECONDS);
  }

  if (newCount > PHONE_ENRICH_DAILY_LIMIT) {
    // Roll back the optimistic increment so we don't permanently over-count.
    await kv.decr(key);
    return {
      allowed: false,
      used: PHONE_ENRICH_DAILY_LIMIT,
      limit: PHONE_ENRICH_DAILY_LIMIT,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    used: newCount,
    limit: PHONE_ENRICH_DAILY_LIMIT,
    remaining: PHONE_ENRICH_DAILY_LIMIT - newCount,
  };
}

export async function releasePhoneEnrichQuota(userId: string): Promise<void> {
  // Refund a slot when an earlier consume succeeded but the downstream
  // Ortto save then threw, so the user isn't penalized for our failure.
  await kv.decr(quotaKey(userId));
}
