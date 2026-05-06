"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset, Rep } from "@/lib/types";

const REP_STORAGE_KEY = "asset-hub:rep-name";

function slugifyName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "asset";
}

function buildUtmUrl(
  asset: Asset,
  rep: Rep,
  defaultScId: string,
  channel: "linkedin" | "email"
): string {
  const utmSource = channel;
  const utmMedium = channel === "linkedin" ? "social" : "email";
  const utmCampaign = slugifyName(rep.name);
  const utmContent = slugifyTitle(asset.title);
  const scId = rep.sc_id ?? defaultScId;

  const cleanUrl = asset.url.replace(/\/+$/, "");
  const separator = cleanUrl.includes("?") ? "&" : "?";

  return `${cleanUrl}${separator}utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}&utm_content=${utmContent}&sc_id=${scId}`;
}

export default function AssetHubPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [defaultScId, setDefaultScId] = useState("");
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const [openAsset, setOpenAsset] = useState<Asset | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/assets").then((r) => r.json()),
      fetch("/api/reps").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([assetsData, repsData, settingsData]) => {
      setAssets(assetsData.assets ?? []);
      setReps(repsData);
      setDefaultScId(settingsData.value ?? "");
      setLoading(false);
    });
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a) => a.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (q && !a.title.toLowerCase().includes(q)) return false;
      if (activeTags.length > 0 && !activeTags.every((t) => a.tags.includes(t))) {
        return false;
      }
      return true;
    });
  }, [assets, search, activeTags]);

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-[1100px]">
        <h1 className="text-2xl font-semibold text-gray-900">Asset Hub</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse PDFs and copy tracked links to share with clients
        </p>

        {/* Search */}
        <div className="mt-5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets..."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {allTags.map((tag) => {
              const active = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-gray-900 text-white"
                      : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
            {activeTags.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTags([])}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="mt-6">
          {filteredAssets.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              No assets match your filters.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col"
                >
                  <h3 className="text-sm font-semibold text-gray-900">{asset.title}</h3>
                  {asset.description && (
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                      {asset.description}
                    </p>
                  )}
                  {asset.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {asset.tags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTag(t)}
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-200"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex justify-end pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setOpenAsset(asset)}
                      className="flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
                    >
                      <ShareIcon />
                      Share
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {openAsset && (
        <ShareModal
          asset={openAsset}
          reps={reps}
          defaultScId={defaultScId}
          onClose={() => setOpenAsset(null)}
        />
      )}
    </div>
  );
}

function ShareModal({
  asset,
  reps,
  defaultScId,
  onClose,
}: {
  asset: Asset;
  reps: Rep[];
  defaultScId: string;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shortening, setShortening] = useState(false);
  const [copiedShort, setCopiedShort] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Restore sticky rep on open.
  useEffect(() => {
    const storedName = localStorage.getItem(REP_STORAGE_KEY);
    if (storedName) {
      const found = reps.find((r) => r.name === storedName);
      if (found) {
        setSelectedRep(found);
        setSearch(found.name);
      }
    }
  }, [reps]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function pickRep(rep: Rep) {
    setSelectedRep(rep);
    setSearch(rep.name);
    setDropdownOpen(false);
    localStorage.setItem(REP_STORAGE_KEY, rep.name);
  }

  const filteredReps = reps.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const utmUrl = selectedRep
    ? buildUtmUrl(asset, selectedRep, defaultScId, channel)
    : null;

  function handleCopyLink() {
    if (!utmUrl) return;
    navigator.clipboard.writeText(utmUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShortenAndCopy() {
    if (!utmUrl) return;
    setShortening(true);
    try {
      let finalUrl = utmUrl;
      try {
        const res = await fetch("/api/shorten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: utmUrl }),
        });
        const data = await res.json();
        if (data?.shortUrl) finalUrl = data.shortUrl;
      } catch {
        // shortener unreachable — fall through with the long URL
      }
      await navigator.clipboard.writeText(finalUrl);
      setCopiedShort(true);
      setTimeout(() => setCopiedShort(false), 2000);
    } finally {
      setShortening(false);
    }
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
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 z-10"
        >
          <CloseIcon />
        </button>

        {/* Asset header */}
        <div className="p-5 pb-0">
          <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
            PDF
          </span>
          <p className="mt-1 text-sm font-bold text-gray-900">{asset.title}</p>
          {asset.description && (
            <p className="mt-1 text-xs text-stone-500">{asset.description}</p>
          )}
          {asset.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {asset.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Open PDF */}
        <div className="px-5 pt-3">
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            Open PDF ↗
          </a>
        </div>

        {/* Tracked link section — only for shareable assets */}
        {asset.shareable && (
          <>
            <div className="mx-5 mt-4 border-t border-stone-200" />

            <div className="p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">
                Generate tracked link
              </p>

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
                      <div className="px-3 py-2 text-sm text-stone-400">No matches</div>
                    ) : (
                      filteredReps.map((rep) => (
                        <button
                          key={rep.name}
                          type="button"
                          onClick={() => pickRep(rep)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                        >
                          {rep.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

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

              {utmUrl && (
                <div className="mt-3">
                  <div className="rounded-md bg-stone-50 p-2.5 text-xs font-mono break-all leading-relaxed text-stone-600">
                    {utmUrl}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                    >
                      {copied ? "Copied!" : "Copy long link"}
                    </button>
                    <button
                      type="button"
                      onClick={handleShortenAndCopy}
                      disabled={shortening}
                      className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                      {shortening
                        ? "..."
                        : copiedShort
                        ? "Copied short!"
                        : "Copy short link"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="h-3" />
      </div>
    </div>
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
