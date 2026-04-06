"use client";

import { useState, useEffect, useRef } from "react";

type Rep = { name: string; sc_id: string | null };

type Post = {
  id: string;
  source: "instagram" | "blog" | "linkedin";
  source_id: string;
  account: string;
  caption: string | null;
  image_url: string | null;
  video_url: string | null;
  published_at: string;
  metadata: Record<string, unknown> | null;
};

type Filter = "all" | "blog" | `instagram:${string}` | `linkedin:${string}`;

function formatLastSynced(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();

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

async function handleDownload(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// ─── UTM helpers (same logic as the builder page) ───

function extractSlug(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "/") return "home";
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || "home";
  } catch {
    return "home";
  }
}

function slugifyName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function buildUtmUrl(
  baseUrl: string,
  rep: Rep,
  channel: "linkedin" | "email",
  defaultScId: string
): string {
  const utmSource = channel;
  const utmMedium = channel === "linkedin" ? "social" : "email";
  const utmCampaign = slugifyName(rep.name);
  const utmContent = extractSlug(baseUrl);
  const scId = rep.sc_id ?? defaultScId;
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const separator = cleanUrl.includes("?") ? "&" : "?";
  return `${cleanUrl}${separator}utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}&utm_content=${utmContent}&sc_id=${scId}`;
}

// ─── Icons ───

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
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
  );
}

function ShareIcon() {
  return (
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
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function SparkleIcon() {
  return (
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
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Repost Modal ───

function RepostModal({
  post,
  reps,
  defaultScId,
  onClose,
}: {
  post: Post;
  reps: Rep[];
  defaultScId: string;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const [captionCopied, setCaptionCopied] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const postUrl =
    (post.metadata?.url as string) ||
    (post.source === "blog"
      ? `https://hoxtonwealth.com/blog/${post.source_id}`
      : "");

  const originalPostUrl =
    (post.metadata?.post_url as string) || (post.metadata?.share_url as string) || "";

  const postTitle =
    post.source === "blog"
      ? (post.metadata?.title as string) || post.source_id
      : `@${post.account}`;

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filteredReps = reps.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const utmUrl =
    selectedRep && postUrl
      ? buildUtmUrl(postUrl, selectedRep, channel, defaultScId)
      : null;

  function handleCopyLink() {
    if (!utmUrl) return;
    navigator.clipboard.writeText(utmUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerateAI() {
    setAiLoading(true);
    setAiText("");
    try {
      const res = await fetch("/api/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: postTitle,
          caption: post.caption,
          source: post.source,
          platform: channel,
        }),
      });
      const data = await res.json();
      if (data.text) {
        setAiText(data.text);
      } else {
        setAiText("Failed to generate post. Check API configuration.");
      }
    } catch {
      setAiText("Failed to generate post.");
    } finally {
      setAiLoading(false);
    }
  }

  function handleCopyAI() {
    navigator.clipboard.writeText(aiText);
    setAiCopied(true);
    setTimeout(() => setAiCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 z-10"
        >
          <CloseIcon />
        </button>

        {/* Post preview */}
        <div className="flex gap-4 p-5 pb-0">
          {post.image_url && (
            <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-stone-100">
              <img
                src={post.image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                post.source === "instagram"
                  ? "bg-rose-100 text-rose-700"
                  : post.source === "linkedin"
                    ? "bg-sky-100 text-sky-700"
                    : "bg-blue-100 text-blue-700"
              }`}
            >
              {post.source === "instagram" ? "Instagram" : post.source === "linkedin" ? "LinkedIn" : "Blog"}
            </span>
            <p className="mt-1 text-sm font-bold text-gray-900 truncate">
              {postTitle}
            </p>
            {post.caption && (
              <p className="mt-0.5 text-xs text-stone-500 line-clamp-2">
                {post.caption}
              </p>
            )}
            <p className="mt-1 text-xs text-stone-400">
              {formatDate(post.published_at)}
            </p>
          </div>
        </div>

        {/* Download */}
        {post.image_url && (
          <div className="px-5 pt-3">
            <button
              onClick={() =>
                handleDownload(
                  post.image_url!,
                  `${post.source}-${post.source_id}`
                )
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <DownloadIcon />
              Download image
            </button>
          </div>
        )}

        {/* Copy caption */}
        {(post.source === "instagram" || post.source === "linkedin") && post.caption && (
          <div className="px-5 pt-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(post.caption!);
                setCaptionCopied(true);
                setTimeout(() => setCaptionCopied(false), 2000);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
            >
              {captionCopied ? "Copied!" : "Copy caption"}
            </button>
          </div>
        )}

        {/* Download video */}
        {post.video_url && (
          <div className="px-5 pt-2">
            <button
              onClick={() =>
                handleDownload(
                  post.video_url!,
                  `${post.source}-${post.source_id}.mp4`
                )
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <DownloadIcon />
              Download video
            </button>
          </div>
        )}

        {/* Open blog article */}
        {post.source === "blog" && (
          <div className="px-5 pt-2">
            <a
              href={`https://hoxtonwealth.com/blog/${post.source_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
            >
              Open article ↗
            </a>
          </div>
        )}

        {/* Open original LinkedIn post */}
        {post.source === "linkedin" && originalPostUrl && (
          <div className="px-5 pt-2">
            <a
              href={originalPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
            >
              Open original post ↗
            </a>
          </div>
        )}

        {/* UTM link builder — only for blog posts */}
        {post.source === "blog" && (
          <>
            <div className="mx-5 mt-4 border-t border-stone-200" />

            <div className="p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                Generate tracked link
              </p>

              {/* Rep selector */}
              <div ref={comboRef} className="relative">
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Your name
                </label>
                <input
                  type="text"
                  value={selectedRep && !dropdownOpen ? selectedRep.name : search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelectedRep(null);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder="Start typing your name..."
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {dropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-stone-200 bg-white shadow-lg max-h-[180px] overflow-y-auto">
                    {filteredReps.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-stone-400">
                        No matches
                      </div>
                    ) : (
                      filteredReps.map((rep) => (
                        <button
                          key={rep.name}
                          type="button"
                          onClick={() => {
                            setSelectedRep(rep);
                            setSearch(rep.name);
                            setDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                        >
                          {rep.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Channel toggle */}
              <div className="mt-3">
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Channel
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel("linkedin")}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      channel === "linkedin"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    LinkedIn
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannel("email")}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      channel === "email"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    Email
                  </button>
                </div>
              </div>

              {/* Generated UTM URL */}
              {utmUrl && (
                <div className="mt-3">
                  <div className="rounded-md bg-stone-50 p-2.5 text-xs font-mono break-all leading-relaxed text-stone-600">
                    {utmUrl}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="mt-2 w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                  >
                    {copied ? "Copied!" : "Copy tracked link"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Divider */}
        <div className="mx-5 mt-4 border-t border-stone-200" />

        {/* AI generate */}
        <div className="p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">
            AI post writer
          </p>
          <button
            onClick={handleGenerateAI}
            disabled={aiLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <SparkleIcon />
            {aiLoading
              ? "Generating..."
              : `Generate ${channel === "linkedin" ? "LinkedIn" : "email"} post`}
          </button>

          {aiText && (
            <div className="mt-3">
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-stone-300 p-3 text-sm leading-relaxed text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              />
              <button
                onClick={handleCopyAI}
                className="mt-2 w-full rounded-md border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
              >
                {aiCopied ? "Copied!" : "Copy post text"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───

export default function ContentHubPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [repostPost, setRepostPost] = useState<Post | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [defaultScId, setDefaultScId] = useState("");
  const [copiedCaptionId, setCopiedCaptionId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/posts").then((r) => r.json()),
      fetch("/api/reps").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([postsData, repsData, settingsData]) => {
      setPosts(postsData.posts ?? []);
      setLastSynced(postsData.lastSynced ?? null);
      setReps(repsData);
      setDefaultScId(settingsData.value);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Derive unique accounts for filter tabs
  const igAccounts = Array.from(new Set(posts.filter((p) => p.source === "instagram").map((p) => p.account))).sort();
  const liAccounts = Array.from(new Set(posts.filter((p) => p.source === "linkedin").map((p) => p.account))).sort();

  const filteredPosts =
    filter === "all"
      ? posts
      : filter === "blog"
        ? posts.filter((p) => p.source === "blog")
        : filter.startsWith("linkedin:")
          ? posts.filter((p) => p.source === "linkedin" && p.account === filter.replace("linkedin:", ""))
          : posts.filter((p) => p.source === "instagram" && p.account === filter.replace("instagram:", ""));

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Content hub</h1>
          <p className="text-sm text-stone-400">
            Last synced: {formatLastSynced(lastSynced)}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(["all", ...igAccounts.map((a) => `instagram:${a}`), ...liAccounts.map((a) => `linkedin:${a}`), "blog"] as Filter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === tab
                  ? "bg-gray-900 text-white"
                  : "border border-stone-300 text-stone-600 hover:bg-stone-100"
              }`}
            >
              {tab === "all"
                ? "All"
                : tab === "blog"
                  ? "Blog"
                  : tab.startsWith("linkedin:")
                    ? `LI: ${tab.replace("linkedin:", "")}`
                    : `IG: ${tab.replace("instagram:", "")}`}
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
          /* Card grid — 5 columns on xl, 4 on lg, 3 on md, 2 on sm, 1 on mobile */
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white"
              >
                {/* Image — shorter aspect */}
                <div className="relative aspect-[4/3] bg-stone-100">
                  {post.image_url ? (
                    <img
                      src={post.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  {post.video_url && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full bg-black/50 p-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      post.source === "instagram"
                        ? "bg-rose-100 text-rose-700"
                        : post.source === "linkedin"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {post.source === "instagram" ? "Instagram" : post.source === "linkedin" ? "LinkedIn" : "Blog"}
                  </span>

                  <p className="mt-1.5 text-xs font-bold text-gray-900 line-clamp-1">
                    {post.source === "blog"
                      ? (post.metadata?.title as string) || post.account
                      : `@${post.account}`}
                  </p>

                  {post.caption && (
                    <p className="mt-0.5 text-[11px] text-stone-500 line-clamp-2">
                      {truncate(post.caption, 100)}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-stone-200 px-3 py-2">
                  <span className="text-[10px] text-stone-400">
                    {formatDate(post.published_at)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {(post.source === "instagram" || post.source === "linkedin") && post.caption && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(post.caption!);
                          setCopiedCaptionId(post.id);
                          setTimeout(() => setCopiedCaptionId(null), 2000);
                        }}
                        className="flex items-center gap-1 rounded-md border border-stone-300 px-2 py-0.5 text-[10px] font-medium text-stone-600 hover:bg-stone-100 transition-colors"
                      >
                        {copiedCaptionId === post.id ? "Copied!" : "Caption"}
                      </button>
                    )}
                    <button
                      onClick={() => setRepostPost(post)}
                      className="flex items-center gap-1 rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-gray-800 transition-colors"
                    >
                      <ShareIcon />
                      Repost
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Repost modal */}
      {repostPost && (
        <RepostModal
          post={repostPost}
          reps={reps}
          defaultScId={defaultScId}
          onClose={() => setRepostPost(null)}
        />
      )}
    </div>
  );
}
