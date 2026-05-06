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

  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");

  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Combobox
  const [repSearch, setRepSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  // Per-card UI state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/assets").then((r) => r.json()),
      fetch("/api/reps").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([assetsData, repsData, settingsData]) => {
      setAssets(assetsData.assets ?? []);
      setReps(repsData);
      setDefaultScId(settingsData.value);
      setLoading(false);

      // Restore sticky rep choice
      const storedName = localStorage.getItem(REP_STORAGE_KEY);
      if (storedName) {
        const found = (repsData as Rep[]).find((r) => r.name === storedName);
        if (found) {
          setSelectedRep(found);
          setRepSearch(found.name);
        }
      }
    });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  const filteredReps = reps.filter((r) =>
    r.name.toLowerCase().includes(repSearch.toLowerCase())
  );

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function pickRep(rep: Rep) {
    setSelectedRep(rep);
    setRepSearch(rep.name);
    setDropdownOpen(false);
    localStorage.setItem(REP_STORAGE_KEY, rep.name);
  }

  async function handleCopyTracked(asset: Asset) {
    if (!selectedRep) {
      setErrorId(asset.id);
      setTimeout(() => setErrorId(null), 2000);
      return;
    }
    setBusyId(asset.id);
    try {
      const utmUrl = buildUtmUrl(asset, selectedRep, defaultScId, channel);
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
        // Shortener unreachable — fall through and copy the long UTM url.
      }
      await navigator.clipboard.writeText(finalUrl);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId(null), 2000);
    } finally {
      setBusyId(null);
    }
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

        {/* Top bar */}
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px_220px]">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets..."
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {/* Rep picker */}
          <div className="relative" ref={comboRef}>
            <input
              type="text"
              value={selectedRep && !dropdownOpen ? selectedRep.name : repSearch}
              onChange={(e) => {
                setRepSearch(e.target.value);
                setSelectedRep(null);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Your name"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {dropdownOpen && (
              <div className="absolute z-10 mt-1 w-full max-h-[220px] overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                {filteredReps.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
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

          {/* Channel toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChannel("linkedin")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                channel === "linkedin"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              LinkedIn
            </button>
            <button
              type="button"
              onClick={() => setChannel("email")}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                channel === "email"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Email
            </button>
          </div>
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

                  <div className="mt-4 flex gap-2 pt-3 border-t border-gray-100">
                    {asset.shareable ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCopyTracked(asset)}
                          disabled={busyId === asset.id}
                          className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {busyId === asset.id
                            ? "..."
                            : copiedId === asset.id
                            ? "Copied!"
                            : "Copy tracked link"}
                        </button>
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Open
                        </a>
                      </>
                    ) : (
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-center text-xs font-medium text-white hover:bg-gray-800"
                      >
                        Download
                      </a>
                    )}
                  </div>
                  {errorId === asset.id && (
                    <p className="mt-2 text-[11px] text-red-500">
                      Pick your name first to generate a tracked link.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
