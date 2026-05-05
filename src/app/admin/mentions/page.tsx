"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Mention = {
  id: string;
  source: "coveragebook" | "google_alerts" | string;
  url: string;
  title: string | null;
  snippet: string | null;
  published_at: string | null;
  source_feed_id: string | null;
  created_at: string;
};

type Feed = {
  id: string;
  name: string;
  rss_url: string;
  active: boolean;
  created_at: string;
};

type SourceFilter = "all" | "coveragebook" | "google_alerts";

type RunResult = {
  coveragebook: { added: number; errors: string[] };
  google_alerts: { added: number; errors: string[] };
  prune: { deleted: number; errors: string[] };
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sourceLabel(source: string): string {
  if (source === "coveragebook") return "Coveragebook";
  if (source === "google_alerts") return "Google Alerts";
  return source;
}

function sourceBadgeClass(source: string): string {
  if (source === "coveragebook") return "bg-purple-100 text-purple-700";
  if (source === "google_alerts") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
}

export default function MentionsAdminPage() {
  const [unauthorized, setUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  const [mentions, setMentions] = useState<Mention[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [filter, setFilter] = useState<SourceFilter>("all");

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [addingFeed, setAddingFeed] = useState(false);
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [feedSaveError, setFeedSaveError] = useState<string | null>(null);

  const [editingFeed, setEditingFeed] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");

  const [deletingFeed, setDeletingFeed] = useState<string | null>(null);

  async function loadAll(currentFilter: SourceFilter = filter) {
    setLoading(true);
    try {
      const params = currentFilter === "all" ? "" : `?source=${currentFilter}`;
      const [mRes, fRes] = await Promise.all([
        fetch(`/api/admin/mentions${params}`),
        fetch("/api/admin/google-alert-feeds"),
      ]);

      if (mRes.status === 401 || fRes.status === 401) {
        setUnauthorized(true);
        return;
      }

      const mJson = await mRes.json();
      const fJson = await fRes.json();
      setMentions(mJson.mentions ?? []);
      setFeeds(fJson.feeds ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handleRunNow() {
    setRunning(true);
    setRunResult(null);
    setRunError(null);
    try {
      const res = await fetch("/api/admin/mentions/run", { method: "POST" });
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRunError(json.error ?? "Run failed");
      } else {
        setRunResult(json.results as RunResult);
        await loadAll(filter);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleAddFeed() {
    setFeedSaveError(null);
    if (!newFeedName.trim() || !newFeedUrl.trim()) {
      setFeedSaveError("Name and URL are required");
      return;
    }
    const res = await fetch("/api/admin/google-alert-feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFeedName.trim(),
        rss_url: newFeedUrl.trim(),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedSaveError(json.error ?? "Failed to add feed");
      return;
    }
    setFeeds((prev) => [...prev, json.feed]);
    setNewFeedName("");
    setNewFeedUrl("");
    setAddingFeed(false);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim() || !editUrl.trim()) return;
    const res = await fetch("/api/admin/google-alert-feeds", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName.trim(), rss_url: editUrl.trim() }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeeds((prev) => prev.map((f) => (f.id === id ? json.feed : f)));
      setEditingFeed(null);
    }
  }

  async function handleToggleActive(feed: Feed) {
    const res = await fetch("/api/admin/google-alert-feeds", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: feed.id, active: !feed.active }),
    });
    const json = await res.json();
    if (res.ok) {
      setFeeds((prev) => prev.map((f) => (f.id === feed.id ? json.feed : f)));
    }
  }

  async function handleDeleteFeed(id: string) {
    const res = await fetch("/api/admin/google-alert-feeds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setFeeds((prev) => prev.filter((f) => f.id !== id));
      setDeletingFeed(null);
    }
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-[400px] rounded-lg border border-gray-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Admin login required
          </h1>
          <p className="text-sm text-gray-500 mb-4">
            Sign in via the admin page first, then come back here.
          </p>
          <Link
            href="/admin"
            className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Go to admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-[900px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/admin"
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ← Admin
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1">
              Mentions
            </h1>
          </div>
          <button
            onClick={handleRunNow}
            disabled={running}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {running ? "Running…" : "Run now"}
          </button>
        </div>

        {/* Run result */}
        {runError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {runError}
          </div>
        )}
        {runResult && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <span className="font-semibold">Run complete.</span>{" "}
            Coveragebook +{runResult.coveragebook.added}, Google Alerts +
            {runResult.google_alerts.added}, pruned {runResult.prune.deleted}.
            {runResult.coveragebook.errors.length +
              runResult.google_alerts.errors.length +
              runResult.prune.errors.length >
              0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-green-700">
                  Show warnings
                </summary>
                <ul className="mt-1 list-disc pl-5 text-xs text-green-700">
                  {[
                    ...runResult.coveragebook.errors,
                    ...runResult.google_alerts.errors,
                    ...runResult.prune.errors,
                  ].map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Mentions list */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Recent mentions ({mentions.length})
            </h2>
            <div className="flex gap-1">
              {(["all", "coveragebook", "google_alerts"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    filter === s
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s === "all" ? "All" : sourceLabel(s)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-gray-400">Loading…</div>
          ) : mentions.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">
              No mentions yet. Add a Google Alert feed and hit Run now.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <div className="grid grid-cols-[100px_1fr_120px_100px_60px] gap-2 px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
                <span>Source</span>
                <span>Title</span>
                <span>Feed / Publisher</span>
                <span>Published</span>
                <span></span>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {mentions.map((m) => (
                  <div
                    key={m.id}
                    className="grid grid-cols-[100px_1fr_120px_100px_60px] gap-2 px-3 py-2 border-b border-gray-100 text-sm items-center"
                  >
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide w-fit ${sourceBadgeClass(
                        m.source
                      )}`}
                    >
                      {sourceLabel(m.source)}
                    </span>
                    <span className="text-xs text-gray-900 truncate">
                      {m.title || m.url}
                    </span>
                    <span className="text-xs text-gray-500 truncate">
                      {m.source_feed_id
                        ? feeds.find((f) => f.id === m.source_feed_id)?.name ?? "—"
                        : m.source === "coveragebook"
                        ? m.snippet || "—"
                        : "—"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(m.published_at)}
                    </span>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 text-right"
                    >
                      Open ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Feeds CRUD */}
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Google Alert feeds ({feeds.length})
            </h2>
            <button
              onClick={() => {
                setAddingFeed(true);
                setNewFeedName("");
                setNewFeedUrl("");
                setFeedSaveError(null);
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              + Add feed
            </button>
          </div>

          <p className="text-xs text-gray-400 mb-3">
            Create alerts at{" "}
            <a
              href="https://www.google.com/alerts"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              google.com/alerts
            </a>
            , set delivery to RSS, then paste the feed URL here.
          </p>

          <div className="border border-gray-200 rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_2fr_70px_120px] gap-2 px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
              <span>Name</span>
              <span>RSS URL</span>
              <span>Active</span>
              <span className="text-right">Actions</span>
            </div>

            {addingFeed && (
              <div className="grid grid-cols-[1fr_2fr_70px_120px] gap-2 px-3 py-2 border-b border-gray-100 bg-blue-50 items-center">
                <input
                  type="text"
                  value={newFeedName}
                  onChange={(e) => setNewFeedName(e.target.value)}
                  placeholder="e.g. Hoxton Wealth"
                  autoFocus
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <input
                  type="url"
                  value={newFeedUrl}
                  onChange={(e) => setNewFeedUrl(e.target.value)}
                  placeholder="https://www.google.com/alerts/feeds/…"
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <span className="text-xs text-gray-400 italic">on</span>
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={handleAddFeed}
                    className="text-xs text-green-600 hover:text-green-800 font-medium"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setAddingFeed(false)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {feedSaveError && (
              <div className="px-3 py-2 text-xs text-red-600 border-b border-gray-100">
                {feedSaveError}
              </div>
            )}

            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="grid grid-cols-[1fr_2fr_70px_120px] gap-2 px-3 py-2 border-b border-gray-100 text-sm items-center"
              >
                {editingFeed === feed.id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                    <input
                      type="url"
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                    <span className="text-xs text-gray-400 italic">
                      {feed.active ? "on" : "off"}
                    </span>
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => handleSaveEdit(feed.id)}
                        className="text-xs text-green-600 hover:text-green-800 font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingFeed(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : deletingFeed === feed.id ? (
                  <>
                    <span className="text-xs text-gray-900 truncate">{feed.name}</span>
                    <span className="text-xs text-red-500">Delete this feed?</span>
                    <span></span>
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => handleDeleteFeed(feed.id)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeletingFeed(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        No
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-900 truncate">{feed.name}</span>
                    <span className="text-xs text-gray-500 truncate" title={feed.rss_url}>
                      {feed.rss_url}
                    </span>
                    <button
                      onClick={() => handleToggleActive(feed)}
                      className={`text-xs font-medium w-fit ${
                        feed.active
                          ? "text-green-600 hover:text-green-800"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {feed.active ? "on" : "off"}
                    </button>
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => {
                          setEditingFeed(feed.id);
                          setEditName(feed.name);
                          setEditUrl(feed.rss_url);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingFeed(feed.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {feeds.length === 0 && !addingFeed && (
              <div className="px-3 py-4 text-center text-xs text-gray-400">
                No feeds yet. Add one to start ingesting Google Alerts.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
