"use client";

import { useState, useMemo, useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import type { Contact, Activity, DateGroup } from "@/lib/marketing-contact/types";
import {
  groupByDate,
  getActivityColor,
  getBestContactTime,
  formatHour,
} from "@/lib/marketing-contact/utils";
import {
  ACTIVITY_IDS,
  ACTIVITY_GROUPS,
} from "@/lib/marketing-contact/constants";

const ENRICHMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readEnrichmentCache(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      enrichmentId: string;
      startedAt: number;
    };
    if (Date.now() - parsed.startedAt > ENRICHMENT_CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.enrichmentId;
  } catch {
    return null;
  }
}

function writeEnrichmentCache(key: string, enrichmentId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ enrichmentId, startedAt: Date.now() })
    );
  } catch {
    // ignore quota errors
  }
}

function clearEnrichmentCache(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export default function MarketingContactPage() {
  const [query, setQuery] = useState("");
  const [contact, setContact] = useState<Contact | null>(null);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [totalActivities, setTotalActivities] = useState(0);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());

  const [enriching, setEnriching] = useState(false);
  const [enrichSaved, setEnrichSaved] = useState(false);
  const [enrichNotFound, setEnrichNotFound] = useState(false);
  const [enrichError, setEnrichError] = useState("");
  const [enrichConflict, setEnrichConflict] = useState<{
    existing: string;
    incoming: string;
  } | null>(null);

  const allGroupKeys = Object.keys(ACTIVITY_GROUPS);

  const filteredGroups: DateGroup[] = useMemo(() => {
    let filtered = allActivities;

    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter((a) => new Date(a.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((a) => new Date(a.created_at) <= to);
    }

    if (activeTypes.size > 0) {
      filtered = filtered.filter((a) => {
        const color = getActivityColor(a.field_id);
        return activeTypes.has(color.label);
      });
    }

    return groupByDate(filtered);
  }, [allActivities, dateFrom, dateTo, activeTypes]);

  const filteredActivities = useMemo(
    () => filteredGroups.flatMap((g) => g.activities),
    [filteredGroups]
  );

  const filteredCount = filteredActivities.length;

  const bestTime = useMemo(
    () => getBestContactTime(filteredActivities),
    [filteredActivities]
  );

  useEffect(() => {
    setExpandedDates(new Set(filteredGroups.map((g) => g.date)));
  }, [filteredGroups]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setContact(null);
    setAllActivities([]);
    setDateFrom("");
    setDateTo("");
    setActiveTypes(new Set());
    setEnriching(false);
    setEnrichSaved(false);
    setEnrichNotFound(false);
    setEnrichError("");
    setEnrichConflict(null);

    try {
      const lookupRes = await fetch("/api/marketing-contact/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const lookupData = await lookupRes.json();
      if (!lookupRes.ok) {
        setError(lookupData.error || "Contact not found");
        return;
      }
      setContact(lookupData.contact);

      let fetched: Activity[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const actRes = await fetch("/api/marketing-contact/activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId: lookupData.contact.id, offset }),
        });
        const actData = await actRes.json();
        if (!actRes.ok) {
          setError(actData.error || "Failed to fetch activities");
          return;
        }
        fetched = [...fetched, ...actData.activities];
        hasMore = actData.hasMore;
        offset = actData.nextOffset;
        setTotalActivities(actData.total);
      }

      setAllActivities(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrich() {
    if (!contact) return;
    setEnriching(true);
    setEnrichSaved(false);
    setEnrichNotFound(false);
    setEnrichError("");
    setEnrichConflict(null);

    const cacheKey = `linkedin-enrich:${contact.email}`;

    try {
      // Resume an in-flight job from a prior click if one exists,
      // so we don't burn a fresh FullEnrich credit on retry.
      let enrichmentId = readEnrichmentCache(cacheKey);

      if (!enrichmentId) {
        const startRes = await fetch(
          "/api/marketing-contact/enrich-linkedin/start",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: contact.email }),
          }
        );
        const startData = await startRes.json();
        if (!startRes.ok) {
          setEnrichError(startData.error || "Failed to start lookup");
          return;
        }
        enrichmentId = startData.enrichmentId as string;
        writeEnrichmentCache(cacheKey, enrichmentId);
      }

      const existingUrl = contact.linkedinUrl || "";
      const params = new URLSearchParams({
        contactId: contact.id,
        existingUrl,
      });

      const TERMINAL_FAIL = new Set([
        "CANCELED",
        "CREDITS_INSUFFICIENT",
        "RATE_LIMIT",
      ]);

      for (let attempt = 0; attempt < 90; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(
          `/api/marketing-contact/enrich-linkedin/${enrichmentId}?${params.toString()}`
        );
        const pollData = await pollRes.json();
        if (!pollRes.ok) {
          setEnrichError(pollData.error || "Lookup failed");
          return;
        }

        if (TERMINAL_FAIL.has(pollData.status)) {
          clearEnrichmentCache(cacheKey);
          setEnrichError(`Lookup ended: ${pollData.status}`);
          return;
        }

        if (pollData.status === "FINISHED") {
          clearEnrichmentCache(cacheKey);
          if (!pollData.linkedinUrl) {
            setEnrichNotFound(true);
            return;
          }
          if (pollData.conflictsWithExisting) {
            setEnrichConflict({
              existing: existingUrl,
              incoming: pollData.linkedinUrl,
            });
            return;
          }
          setContact({ ...contact, linkedinUrl: pollData.linkedinUrl });
          if (pollData.saved) setEnrichSaved(true);
          return;
        }
      }

      setEnrichError(
        "Still running after 3 minutes — try again later; we'll pick up the same lookup."
      );
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setEnriching(false);
    }
  }

  async function handleReplace() {
    if (!contact || !enrichConflict) return;
    setEnriching(true);
    setEnrichError("");
    try {
      const res = await fetch(
        "/api/marketing-contact/enrich-linkedin/save",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: contact.id,
            linkedinUrl: enrichConflict.incoming,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setEnrichError(data.error || "Save failed");
        return;
      }
      setContact({ ...contact, linkedinUrl: enrichConflict.incoming });
      setEnrichConflict(null);
      setEnrichSaved(true);
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEnriching(false);
    }
  }

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function toggleType(label: string) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setActiveTypes(new Set());
  }

  function getActivityLabel(fieldId: string): string {
    return ACTIVITY_IDS[fieldId] || fieldId;
  }

  function formatAttr(
    attr: Record<string, unknown>
  ): { label: string; value: string }[] {
    const labels: Record<string, string> = {
      "str::asn": "Asset",
      "str::cn": "Campaign",
      "str::sub": "Subject",
      "str::fn": "Form Name",
      "str::url": "URL",
      "str::src": "Source",
      "str::lpn": "Landing Page",
      "str::wn": "Widget Name",
    };
    const hiddenKeys = new Set([
      "str::email",
      "str::e",
      "str::ph",
      "str::pho",
      "str::phone",
      "pho::pn",
      "str::mp",
    ]);
    return Object.entries(attr)
      .filter(
        ([key, v]) =>
          v !== null && v !== undefined && v !== "" && !hiddenKeys.has(key)
      )
      .map(([key, value]) => ({
        label:
          labels[key] ||
          key.replace(/^str::/, "").replace(/^int::/, "").replace(/^bol::/, ""),
        value: String(value),
      }));
  }

  const hasFilters = dateFrom || dateTo || activeTypes.size > 0;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Marketing Activities</h1>
          <p className="text-gray-500">
            Look up an Ortto contact by Ortto ID, HXT ID, or email address.
          </p>
        </div>
        <UserButton afterSignOutUrl="/marketing-contact/sign-in" />
      </div>

      <form onSubmit={handleSearch} className="mb-6 flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. user@example.com, HXT123, or 006995..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Loading..." : "Search"}
        </button>
      </form>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {contact && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {contact.firstName} {contact.lastName}
          </h2>
          <div className="mt-1 space-y-1 text-sm text-gray-500">
            <p>Email: {contact.email}</p>
            {contact.hxtId && <p>HXT ID: {contact.hxtId}</p>}
            <p>Ortto ID: {contact.id}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span>LinkedIn:</span>
              {contact.linkedinUrl ? (
                <>
                  <a
                    href={contact.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {contact.linkedinUrl}
                  </a>
                  <button
                    type="button"
                    onClick={handleEnrich}
                    disabled={enriching}
                    className="text-xs text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
                  >
                    {enriching ? "Looking up…" : "Re-enrich"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleEnrich}
                  disabled={enriching}
                  className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  {enriching ? "Looking up…" : "Find LinkedIn (FullEnrich)"}
                </button>
              )}
            </div>
            {enrichSaved && (
              <p className="text-xs text-green-600">Saved to Ortto ✓</p>
            )}
            {enrichNotFound && (
              <p className="text-xs text-gray-400">
                No LinkedIn profile found.
              </p>
            )}
            {enrichError && (
              <p className="text-xs text-red-600">{enrichError}</p>
            )}
            {enrichConflict && (
              <div className="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs">
                <p className="font-semibold text-amber-900">
                  Different LinkedIn URL returned:
                </p>
                <p className="mt-1">
                  <span className="text-amber-700">Existing:</span>{" "}
                  <a
                    href={enrichConflict.existing}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {enrichConflict.existing}
                  </a>
                </p>
                <p>
                  <span className="text-amber-700">New:</span>{" "}
                  <a
                    href={enrichConflict.incoming}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {enrichConflict.incoming}
                  </a>
                </p>
                <button
                  type="button"
                  onClick={handleReplace}
                  disabled={enriching}
                  className="mt-2 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Replace existing
                </button>
              </div>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {totalActivities} total activities
          </p>
        </div>
      )}

      {allActivities.length > 0 && (
        <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {allGroupKeys.map((key) => {
              const group = ACTIVITY_GROUPS[key];
              const isActive = activeTypes.has(group.label);
              return (
                <button
                  key={key}
                  onClick={() => toggleType(group.label)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                    isActive
                      ? `${group.bg} ${group.color} border-current`
                      : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                  }`}
                >
                  {group.label}
                </button>
              );
            })}
            <button
              onClick={() => toggleType("Other")}
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                activeTypes.has("Other")
                  ? "border-current bg-slate-100 text-slate-700"
                  : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
              }`}
            >
              Other
            </button>
          </div>

          {hasFilters && (
            <p className="text-xs text-gray-400">
              Showing {filteredCount} of {totalActivities} activities
            </p>
          )}
        </div>
      )}

      {(bestTime.overall || bestTime.email) && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-amber-800">
            Suggested best time to contact
          </h3>
          <div className="flex flex-wrap gap-6">
            {bestTime.overall && (
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-600">
                  All activities
                </p>
                <p className="text-sm font-medium text-amber-900">
                  {bestTime.overall.bestDay}s around{" "}
                  {formatHour(bestTime.overall.bestHour)}
                </p>
                <p className="text-xs text-amber-500">
                  Based on {bestTime.overall.activityCount} activities
                </p>
              </div>
            )}
            {bestTime.email && (
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-600">
                  Email engagement
                </p>
                <p className="text-sm font-medium text-amber-900">
                  {bestTime.email.bestDay}s around{" "}
                  {formatHour(bestTime.email.bestHour)}
                </p>
                <p className="text-xs text-amber-500">
                  Based on {bestTime.email.activityCount} email activities
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {filteredGroups.length > 0 && (
        <div className="space-y-3">
          {filteredGroups.map((group) => (
            <div
              key={group.date}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <button
                onClick={() => toggleDate(group.date)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
              >
                <span className="font-semibold text-gray-900">
                  {group.date}
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    ({group.activities.length})
                  </span>
                </span>
                <span className="text-gray-400">
                  {expandedDates.has(group.date) ? "▼" : "▶"}
                </span>
              </button>
              {expandedDates.has(group.date) && (
                <div className="divide-y divide-gray-50 border-t border-gray-100">
                  {group.activities.map((activity, i) => {
                    const colors = getActivityColor(activity.field_id);
                    return (
                      <div
                        key={activity.id || i}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50"
                      >
                        <span
                          className={`mt-0.5 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.color}`}
                        >
                          {colors.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {getActivityLabel(activity.field_id)}
                          </p>
                          {Object.keys(activity.attr).length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                              {formatAttr(activity.attr).map(
                                ({ label, value }) => (
                                  <span
                                    key={label}
                                    className="text-xs text-gray-500"
                                  >
                                    <span className="text-gray-400">
                                      {label}:
                                    </span>{" "}
                                    {value}
                                  </span>
                                )
                              )}
                            </div>
                          )}
                        </div>
                        <span className="mt-0.5 whitespace-nowrap text-xs text-gray-400">
                          {new Date(activity.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {allActivities.length > 0 && filteredGroups.length === 0 && (
        <div className="py-8 text-center text-gray-400">
          No activities match your filters.
          <button
            onClick={clearFilters}
            className="ml-1 text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        </div>
      )}
    </main>
  );
}
