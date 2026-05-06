"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/lib/types";

// Datocms uses `?dl=<filename>` to set Content-Disposition: attachment.
// Strip it for inline view; ensure it's present for download.
function withInlineUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete("dl");
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function withDownloadUrl(rawUrl: string, fallbackName: string): string {
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has("dl")) {
      u.searchParams.set("dl", fallbackName);
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function downloadFilename(asset: Asset): string {
  try {
    const u = new URL(asset.url);
    const base = u.pathname.split("/").pop() || "";
    if (base) return base;
  } catch {
    // fall through
  }
  return asset.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".pdf";
}

export default function AssetHubPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const [openAsset, setOpenAsset] = useState<Asset | null>(null);

  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((data) => {
        setAssets(data.assets ?? []);
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
          Browse PDFs — open in your browser or download to your device.
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
                      className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {openAsset && (
        <AssetModal asset={openAsset} onClose={() => setOpenAsset(null)} />
      )}
    </div>
  );
}

function AssetModal({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const filename = downloadFilename(asset);

  function handleBackdropClick(e: React.MouseEvent) {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

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

        <div className="p-5 space-y-2">
          <a
            href={withInlineUrl(asset.url)}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            Open PDF ↗
          </a>
          <a
            href={withDownloadUrl(asset.url, filename)}
            download={filename}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            <DownloadIcon />
            Download PDF
          </a>
        </div>
      </div>
    </div>
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

function DownloadIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
