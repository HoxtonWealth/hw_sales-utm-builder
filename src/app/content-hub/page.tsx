"use client";

import { useState, useEffect } from "react";

type Post = {
  id: string;
  source: "instagram" | "blog";
  source_id: string;
  account: string;
  caption: string | null;
  image_url: string | null;
  published_at: string;
  metadata: Record<string, unknown> | null;
};

type Filter = "all" | "instagram" | "blog";

function formatLastSynced(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();

  if (isToday) return `today, ${time}`;

  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  return `${month} ${day}, ${time}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

async function handleDownload(imageUrl: string, filename: string) {
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Fallback: open in new tab
    window.open(imageUrl, "_blank");
  }
}

export default function ContentHubPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then((data) => {
        setPosts(data.posts ?? []);
        setLastSynced(data.lastSynced ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredPosts =
    filter === "all" ? posts : posts.filter((p) => p.source === filter);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Content hub</h1>
          <p className="text-sm text-stone-400">
            Last synced: {formatLastSynced(lastSynced)}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex gap-2">
          {(["all", "instagram", "blog"] as Filter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === tab
                  ? "bg-gray-900 text-white"
                  : "border border-stone-300 text-stone-600 hover:bg-stone-100"
              }`}
            >
              {tab === "all" ? "All" : tab === "instagram" ? "Instagram" : "Blog"}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {filteredPosts.length === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-stone-500">No posts yet.</p>
            <p className="mt-1 text-sm text-stone-400">
              Run the scraper to populate content.
            </p>
          </div>
        ) : (
          /* Card grid */
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white"
              >
                {/* Image */}
                <div className="aspect-square bg-stone-100">
                  {post.image_url ? (
                    <img
                      src={post.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>

                {/* Body */}
                <div className="p-4">
                  {/* Source badge */}
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      post.source === "instagram"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {post.source === "instagram" ? "Instagram" : "Blog"}
                  </span>

                  {/* Account name */}
                  <p className="mt-2 text-sm font-bold text-gray-900">
                    {post.source === "instagram"
                      ? `@${post.account}`
                      : (post.metadata?.title as string) || post.account}
                  </p>

                  {/* Caption */}
                  {post.caption && (
                    <p className="mt-1 text-sm text-stone-500 line-clamp-3">
                      {truncate(post.caption, 150)}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3">
                  <span className="text-xs text-stone-400">
                    {formatDate(post.published_at)}
                  </span>

                  {post.image_url && (
                    <button
                      onClick={() =>
                        handleDownload(
                          post.image_url!,
                          `${post.source}-${post.source_id}`
                        )
                      }
                      className="flex items-center gap-1.5 rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 text-center">
          <a href="/" className="text-xs text-stone-400 hover:text-stone-600">
            &larr; UTM Builder
          </a>
        </div>
      </div>
    </div>
  );
}
