"use client";

import { useEffect, useRef, useState } from "react";

type Email = {
  id: string;
  asset_id: string;
  campaign_id: string;
  variant: "a" | "b" | null;
  name: string;
  subject: string | null;
  preview: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  body_html: string;
  image_url: string | null;
  sent_at: string;
};

function formatLastSynced(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
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

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "email"
  );
}

/** Pull a "Daily Sparkle" prefix out of "Daily Sparkle — Spain pensions". */
function namePrefix(name: string): string | null {
  const sep = name.match(/^(.*?)\s+[—-]\s+/);
  return sep ? sep[1].trim() : null;
}

function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

// ─── Icons ───

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

function EnvelopeIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

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

// ─── Card thumbnail ───

function CardThumbnail({ email }: { email: Email }) {
  return (
    <div className="relative aspect-[4/3] bg-stone-100">
      {email.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={email.image_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-400">
          <EnvelopeIcon />
        </div>
      )}
      {email.variant && (
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
          {email.variant}
        </span>
      )}
    </div>
  );
}

// ─── Modal ───

function EmailModal({ email, onClose }: { email: Email; onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<"subject" | "preview" | "html" | null>(null);

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

  function copy(text: string | null, key: "subject" | "preview" | "html") {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const downloadName = slugify(email.subject || email.name);

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
          className="absolute top-4 right-4 z-10 text-stone-400 hover:text-stone-600"
        >
          <CloseIcon />
        </button>

        {/* Header */}
        <div className="flex gap-4 p-5 pb-0">
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-stone-100">
            {email.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={email.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-400">
                <EnvelopeIcon size={32} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              Email{email.variant ? ` · ${email.variant.toUpperCase()}` : ""}
            </span>
            <p className="mt-1 truncate text-sm font-bold text-gray-900">
              {email.subject || email.name}
            </p>
            {email.preview && (
              <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">{email.preview}</p>
            )}
            <p className="mt-1 text-xs text-stone-400">
              {email.from_name ? `${email.from_name} · ` : ""}
              {formatDate(email.sent_at)}
            </p>
          </div>
        </div>

        {/* Inline preview */}
        <div className="px-5 pt-4">
          <p className="mb-2 text-xs font-medium text-stone-500">Preview</p>
          <iframe
            title="Email preview"
            srcDoc={email.body_html}
            sandbox="allow-same-origin"
            className="h-[400px] w-full rounded-lg border border-stone-200 bg-white"
          />
          <a
            href={`/email-hub/${email.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            Open full preview ↗
          </a>
        </div>

        {/* Actions */}
        <div className="space-y-2 p-5">
          <button
            onClick={() => downloadHtml(email.body_html, downloadName)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            <DownloadIcon />
            Download HTML
          </button>
          <button
            onClick={() => copy(email.subject, "subject")}
            disabled={!email.subject}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50"
          >
            {copied === "subject" ? "Copied!" : "Copy subject"}
          </button>
          <button
            onClick={() => copy(email.preview, "preview")}
            disabled={!email.preview}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50"
          >
            {copied === "preview" ? "Copied!" : "Copy preview text"}
          </button>
          <button
            onClick={() => copy(email.body_html, "html")}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            {copied === "html" ? "Copied!" : "Copy HTML"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───

type Filter = "all" | { kind: "prefix"; value: string };

function filterKey(f: Filter): string {
  return f === "all" ? "all" : `prefix:${f.value}`;
}

export default function EmailHubPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [openEmail, setOpenEmail] = useState<Email | null>(null);
  const [copiedSubjectId, setCopiedSubjectId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/emails")
      .then((r) => r.json())
      .then((data) => {
        setEmails(data.emails ?? []);
        setLastSynced(data.lastSynced ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const prefixes = Array.from(
    new Set(emails.map((e) => namePrefix(e.name)).filter((p): p is string => !!p))
  ).sort();

  const filteredEmails =
    filter === "all"
      ? emails
      : emails.filter((e) => namePrefix(e.name) === filter.value);

  const tabs: Filter[] = ["all", ...prefixes.map((p) => ({ kind: "prefix" as const, value: p }))];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Email hub</h1>
          <p className="text-sm text-stone-400">
            Last synced: {formatLastSynced(lastSynced)}
          </p>
        </div>

        {/* Filter tabs */}
        {prefixes.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const key = filterKey(tab);
              const active = filterKey(filter) === key;
              const label = tab === "all" ? "All" : tab.value;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(tab)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-gray-900 text-white"
                      : "border border-stone-300 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {filteredEmails.length === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-stone-500">No emails yet.</p>
            <p className="mt-1 text-sm text-stone-400">
              Run the Ortto scraper to populate emails.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredEmails.map((email) => (
              <div
                key={email.id}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white"
              >
                <CardThumbnail email={email} />

                <div className="p-3">
                  <span className="inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                    Email
                  </span>
                  <p className="mt-1.5 line-clamp-1 text-xs font-bold text-gray-900">
                    {email.subject || email.name}
                  </p>
                  {email.preview && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-500">
                      {email.preview}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-stone-200 px-3 py-2">
                  <span className="text-[10px] text-stone-400">
                    {formatDate(email.sent_at)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {email.subject && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(email.subject!);
                          setCopiedSubjectId(email.id);
                          setTimeout(() => setCopiedSubjectId(null), 2000);
                        }}
                        className="flex items-center gap-1 rounded-md border border-stone-300 px-2 py-0.5 text-[10px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
                      >
                        {copiedSubjectId === email.id ? "Copied!" : "Subject"}
                      </button>
                    )}
                    <button
                      onClick={() => setOpenEmail(email)}
                      className="flex items-center gap-1 rounded-md bg-gray-900 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-gray-800"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openEmail && <EmailModal email={openEmail} onClose={() => setOpenEmail(null)} />}
    </div>
  );
}
