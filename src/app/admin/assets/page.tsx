"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Asset } from "@/lib/types";

type FormState = {
  title: string;
  url: string;
  description: string;
  tagsInput: string;
  shareable: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  url: "",
  description: "",
  tagsInput: "",
  shareable: false,
};

function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0)
    )
  );
}

export default function AdminAssetsPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/assets");
      if (res.status === 401) {
        setLoggedIn(false);
        return;
      }
      const data = await res.json();
      setAssets(data.assets ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // If we already have the cookie, treat as logged in and load.
    fetch("/api/admin/assets").then((r) => {
      if (r.ok) {
        setLoggedIn(true);
        r.json().then((d) => setAssets(d.assets ?? []));
      }
    });
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setLoggedIn(true);
        setPassword("");
        await refresh();
      } else {
        setAuthError("Invalid password");
      }
    } catch {
      setAuthError("Something went wrong");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    const res = await fetch("/api/admin/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        url: form.url.trim(),
        description: form.description.trim() || null,
        tags: parseTags(form.tagsInput),
        shareable: form.shareable,
      }),
    });
    if (res.ok) {
      setForm(EMPTY_FORM);
      await refresh();
    } else {
      const data = await res.json().catch(() => null);
      setCreateError(data?.error ?? "Failed to create");
    }
    setCreating(false);
  }

  function startEdit(asset: Asset) {
    setEditingId(asset.id);
    setEditForm({
      title: asset.title,
      url: asset.url,
      description: asset.description ?? "",
      tagsInput: asset.tags.join(", "),
      shareable: asset.shareable,
    });
    setEditError("");
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setSavingEdit(true);
    setEditError("");
    const res = await fetch("/api/admin/assets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        title: editForm.title.trim(),
        url: editForm.url.trim(),
        description: editForm.description.trim(),
        tags: parseTags(editForm.tagsInput),
        shareable: editForm.shareable,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      await refresh();
    } else {
      const data = await res.json().catch(() => null);
      setEditError(data?.error ?? "Failed to save");
    }
    setSavingEdit(false);
  }

  async function handleDelete(id: string) {
    const res = await fetch("/api/admin/assets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setDeletingId(null);
      await refresh();
    }
  }

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-[400px]">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">Admin login</h1>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {authError && (
                <p className="mt-2 text-sm text-red-500">{authError}</p>
              )}
              <button
                type="submit"
                disabled={authLoading}
                className="mt-3 w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {authLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-[800px]">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Manage assets</h1>
          <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
            ← Admin
          </Link>
        </div>

        {/* Add new */}
        <form
          onSubmit={handleCreate}
          className="mt-6 rounded-lg border border-gray-200 bg-white p-5 space-y-3"
        >
          <h2 className="text-sm font-semibold text-gray-700">Add asset</h2>

          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title (e.g. Tax year-end checklist)"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <input
            type="url"
            required
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://… direct PDF URL"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Short description (optional)"
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <input
            type="text"
            value={form.tagsInput}
            onChange={(e) => setForm({ ...form, tagsInput: e.target.value })}
            placeholder="Tags, comma-separated (e.g. tax, checklist, year-end)"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.shareable}
              onChange={(e) => setForm({ ...form, shareable: e.target.checked })}
            />
            Reps can share this with clients (enables tracked link)
          </label>

          {createError && <p className="text-sm text-red-500">{createError}</p>}

          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {creating ? "Adding..." : "Add asset"}
          </button>
        </form>

        {/* List */}
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Assets ({assets.length})
          </h2>

          {loading && (
            <div className="text-center text-xs text-gray-400 py-4">Loading...</div>
          )}

          {!loading && assets.length === 0 && (
            <div className="text-center text-xs text-gray-400 py-4">
              No assets yet. Add one above.
            </div>
          )}

          <ul className="divide-y divide-gray-100">
            {assets.map((asset) => (
              <li key={asset.id} className="py-3">
                {editingId === asset.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <input
                      type="url"
                      value={editForm.url}
                      onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <textarea
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm({ ...editForm, description: e.target.value })
                      }
                      rows={2}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      value={editForm.tagsInput}
                      onChange={(e) =>
                        setEditForm({ ...editForm, tagsInput: e.target.value })
                      }
                      placeholder="Tags, comma-separated"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={editForm.shareable}
                        onChange={(e) =>
                          setEditForm({ ...editForm, shareable: e.target.checked })
                        }
                      />
                      Shareable with clients
                    </label>
                    {editError && <p className="text-xs text-red-500">{editError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {savingEdit ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {asset.title}
                        </span>
                        {asset.shareable && (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                            Shareable
                          </span>
                        )}
                      </div>
                      {asset.description && (
                        <p className="mt-0.5 text-xs text-gray-500">{asset.description}</p>
                      )}
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block text-xs text-blue-600 hover:underline truncate"
                      >
                        {asset.url}
                      </a>
                      {asset.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
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
                    <div className="flex items-center gap-2 shrink-0">
                      {deletingId === asset.id ? (
                        <>
                          <span className="text-xs text-red-500">Sure?</span>
                          <button
                            onClick={() => handleDelete(asset.id)}
                            className="text-xs text-red-600 font-medium hover:text-red-800"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(asset)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingId(asset.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
