"use client";

import { useState, useEffect, useRef } from "react";
import { Rep } from "@/lib/types";

export default function BuilderPage() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [defaultScId, setDefaultScId] = useState("");
  const [loading, setLoading] = useState(true);

  const [url, setUrl] = useState("");
  const [selectedRep, setSelectedRep] = useState<Rep | null>(null);
  const [channel, setChannel] = useState<"linkedin" | "email">("linkedin");

  const [copied, setCopied] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [shortUrl, setShortUrl] = useState("");
  const [shortening, setShortening] = useState(false);
  const [shortCopied, setShortCopied] = useState(false);

  // Combobox state
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/reps").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([repsData, settingsData]) => {
      setReps(repsData);
      setDefaultScId(settingsData.value);
      setLoading(false);
    });
  }, []);

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

  const filteredReps = reps.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  function isValidUrl(str: string): boolean {
    try {
      const u = new URL(str);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

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

  function generateUtmUrl(): string | null {
    if (!url || !selectedRep || !isValidUrl(url)) return null;

    const utmSource = channel;
    const utmMedium = channel === "linkedin" ? "social" : "email";
    const utmCampaign = slugifyName(selectedRep.name);
    const utmContent = extractSlug(url);
    const scId = selectedRep.sc_id ?? defaultScId;

    const cleanUrl = url.replace(/\/+$/, "");
    const separator = cleanUrl.includes("?") ? "&" : "?";

    return `${cleanUrl}${separator}utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}&utm_content=${utmContent}&sc_id=${scId}`;
  }

  function handleUrlChange(val: string) {
    setUrl(val);
    setShortUrl("");
    if (val && !isValidUrl(val)) {
      setUrlError("Please enter a valid URL (starting with http:// or https://)");
    } else {
      setUrlError("");
    }
  }

  function handleCopy() {
    const utmUrl = generateUtmUrl();
    if (!utmUrl) return;
    navigator.clipboard.writeText(utmUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShorten() {
    const utmUrl = generateUtmUrl();
    if (!utmUrl) return;
    setShortening(true);
    try {
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: utmUrl }),
      });
      const data = await res.json();
      if (data.shortUrl) {
        setShortUrl(data.shortUrl);
      }
    } catch {
      // silently fail
    } finally {
      setShortening(false);
    }
  }

  function handleCopyShort() {
    navigator.clipboard.writeText(shortUrl);
    setShortCopied(true);
    setTimeout(() => setShortCopied(false), 2000);
  }

  const utmUrl = generateUtmUrl();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-[520px]">
        <h1 className="text-2xl font-semibold text-gray-900">UTM link builder</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate tracked links for your outreach
        </p>

        {reps.length === 0 ? (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No reps configured yet. Ask your admin to add them.
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
            {/* URL Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Paste your link
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://yoursite.com/guides/ai-marketing-101"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {urlError && (
                <p className="mt-1 text-xs text-red-500">{urlError}</p>
              )}
            </div>

            {/* Name Combobox */}
            <div className="mt-4" ref={comboRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your name
              </label>
              <div className="relative">
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {dropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-[220px] overflow-y-auto">
                    {filteredReps.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400">
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
            </div>

            {/* Channel Toggle */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Channel
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setChannel("linkedin")}
                  className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
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
                  className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    channel === "email"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Email
                </button>
              </div>
            </div>

            {/* Generated URL */}
            {utmUrl && (
              <div className="mt-5 border-t border-gray-200 pt-5">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Your tracked link
                </p>
                <div className="rounded-md bg-gray-50 p-3 text-xs font-mono break-all leading-relaxed">
                  <HighlightedUrl url={utmUrl} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex-1 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={handleShorten}
                    disabled={shortening}
                    className="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {shortening ? "..." : "Shorten"}
                  </button>
                </div>

                {shortUrl && (
                  <div className="mt-3">
                    <div className="rounded-md bg-blue-50 p-3 text-sm font-mono break-all text-blue-700">
                      {shortUrl}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyShort}
                      className="mt-2 w-full rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      {shortCopied ? "Copied!" : "Copy short link"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function HighlightedUrl({ url }: { url: string }) {
  const parts = url.split(/(utm_source=|utm_medium=|utm_campaign=|utm_content=|sc_id=)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^(utm_source=|utm_medium=|utm_campaign=|utm_content=|sc_id=)$/.test(part) ? (
          <span key={i} className="text-blue-600 font-semibold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
