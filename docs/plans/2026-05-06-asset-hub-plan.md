# Asset Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an admin-curated PDF link library with rep-facing browse + tag filter + UTM-tracked sharing.

**Architecture:** New Supabase `assets` table stores PDF URLs (no file upload). Admin CRUD at `/admin/assets` reuses the existing `admin_session` cookie. Public `/asset-hub` page renders a card grid with tag-chip filters. The `shareable` boolean per asset toggles a "Copy tracked link" button that builds UTMs + sc_id and shortens via the existing `/api/shorten` route.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Supabase (`@supabase/supabase-js` via the `getSupabase()` helper that wraps `fetch` with `cache: "no-store"`), Upstash KV (existing rep store, reused), Short.io (existing shortener route).

**Reference doc:** `docs/plans/2026-05-06-asset-hub-design.md`.

**Conventions in this repo (do not deviate without asking):**
- Admin CRUD routes are a **single `route.ts`** with `POST`/`PUT`/`DELETE` exports; `id` is passed in the JSON body for `PUT`/`DELETE` (see `src/app/api/admin/google-alert-feeds/route.ts`). Do not create `[id]/route.ts`.
- Every admin route starts with `if (!isAuthenticated(request)) return 401`.
- All `GET` routes export `export const dynamic = "force-dynamic"`.
- Always go through `getSupabase()` from `src/lib/supabase.ts` — it disables Next.js's data-cache layer (memory: stale reads will leak across invocations otherwise).
- No automated tests exist. Replace TDD steps with manual smoke checks (curl + browser) and `npm run build` for type-check.

**Migration numbering:** the next free number is **003**. `001_mentions.sql` and `002_mentions_add_created_at.sql` already exist.

**Commit cadence:** commit after every task. Commit messages should be sentence-case, present tense, ≤72 chars on the subject (match `git log` style: e.g. `Filter Email Hub tabs by audience instead of date`).

---

## Task 1: Create the Supabase migration file

**Files:**
- Create: `scripts/migrations/003_assets.sql`

**Step 1: Write the migration**

Create `scripts/migrations/003_assets.sql`:

```sql
-- Asset Hub: admin-curated library of PDF links for sales reps.
-- Files themselves stay on their existing CDNs (datocms etc.) — we only
-- store the URL + metadata. RLS intentionally disabled to match the
-- mentions / posts / emails tables (server uses service-role key).

create table if not exists assets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  url         text not null,
  description text,
  tags        text[] not null default '{}',
  shareable   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists assets_tags_idx
  on assets using gin (tags);

create index if not exists assets_created_at_idx
  on assets (created_at desc);
```

**Step 2: Verify the SQL parses locally**

Run: `cat scripts/migrations/003_assets.sql | head -25`
Expected: prints the migration cleanly, no shell errors.

**Step 3: Tell the user to run the migration**

The user runs this manually in the Supabase SQL editor (same as `001_mentions.sql`). **Do NOT** attempt to run it from code — there is no migration runner in this project. After they confirm "migration applied", proceed.

**Step 4: Commit**

```bash
git add scripts/migrations/003_assets.sql
git commit -m "Add 003_assets migration for Asset Hub"
```

---

## Task 2: Add `Asset` type to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Read the current file**

```bash
cat src/lib/types.ts
```

**Step 2: Append the Asset type**

Add to the end of `src/lib/types.ts`:

```ts
export type Asset = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  tags: string[];
  shareable: boolean;
  created_at: string;
  updated_at: string;
};
```

**Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

**Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "Add Asset type"
```

---

## Task 3: Add `src/lib/assets.ts` data-access helpers

**Files:**
- Create: `src/lib/assets.ts`

**Step 1: Write the helper module**

Create `src/lib/assets.ts`:

```ts
import { getSupabase } from "@/lib/supabase";
import type { Asset } from "@/lib/types";

const SELECT = "id, title, url, description, tags, shareable, created_at, updated_at";

export async function listAssets(): Promise<Asset[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("assets")
    .select(SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Asset[];
}

export type CreateAssetInput = {
  title: string;
  url: string;
  description?: string | null;
  tags: string[];
  shareable: boolean;
};

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      title: input.title,
      url: input.url,
      description: input.description ?? null,
      tags: input.tags,
      shareable: input.shareable,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as Asset;
}

export type UpdateAssetInput = Partial<Omit<CreateAssetInput, "tags">> & {
  tags?: string[];
};

export async function updateAsset(id: string, input: UpdateAssetInput): Promise<Asset> {
  const supabase = getSupabase();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.url !== undefined) updates.url = input.url;
  if (input.description !== undefined) updates.description = input.description;
  if (input.tags !== undefined) updates.tags = input.tags;
  if (input.shareable !== undefined) updates.shareable = input.shareable;

  const { data, error } = await supabase
    .from("assets")
    .update(updates)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as Asset;
}

export async function deleteAsset(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
```

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

**Step 3: Commit**

```bash
git add src/lib/assets.ts
git commit -m "Add assets data-access helpers"
```

---

## Task 4: Build the public read API at `src/app/api/assets/route.ts`

**Files:**
- Create: `src/app/api/assets/route.ts`

**Step 1: Write the route**

Create `src/app/api/assets/route.ts`:

```ts
import { NextResponse } from "next/server";
import { listAssets } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const assets = await listAssets();
    return NextResponse.json({ assets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch assets";
    console.error("GET /api/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

Note on `console.error`: structured as `JSON.stringify(...)` because Vercel's table view truncates bare strings (memory).

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

**Step 3: Manually smoke-test against an empty table**

Run: `npm run dev` (in another terminal if not already running), then in this terminal:
```bash
curl -s http://localhost:3000/api/assets | head -c 200
```
Expected: `{"assets":[]}`. If you get a Supabase env error, stop and tell the user to verify `SUPABASE_URL` and `SUPABASE_KEY` in `.env.local`.

**Step 4: Commit**

```bash
git add src/app/api/assets/route.ts
git commit -m "Add public GET /api/assets"
```

---

## Task 5: Build the admin CRUD API at `src/app/api/admin/assets/route.ts`

**Files:**
- Create: `src/app/api/admin/assets/route.ts`

**Step 1: Write the route**

Mirrors the structure of `src/app/api/admin/google-alert-feeds/route.ts`. Create `src/app/api/admin/assets/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  createAsset,
  deleteAsset,
  listAssets,
  updateAsset,
} from "@/lib/assets";

export const dynamic = "force-dynamic";

function isValidHttpUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.trim().length === 0) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeTags(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  return Array.from(new Set(cleaned));
}

export async function GET(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const assets = await listAssets();
    return NextResponse.json({ assets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("GET /api/admin/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const url = body?.url;
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  const tags = normalizeTags(body?.tags) ?? [];
  const shareable = Boolean(body?.shareable);

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!isValidHttpUrl(url)) {
    return NextResponse.json(
      { error: "url must be a valid http(s) URL" },
      { status: 400 }
    );
  }

  try {
    const asset = await createAsset({
      title,
      url,
      description: description || null,
      tags,
      shareable,
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("POST /api/admin/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: {
    title?: string;
    url?: string;
    description?: string | null;
    tags?: string[];
    shareable?: boolean;
  } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { error: "title must be a non-empty string" },
        { status: 400 }
      );
    }
    updates.title = body.title.trim();
  }
  if (body.url !== undefined) {
    if (!isValidHttpUrl(body.url)) {
      return NextResponse.json(
        { error: "url must be a valid http(s) URL" },
        { status: 400 }
      );
    }
    updates.url = body.url;
  }
  if (body.description !== undefined) {
    updates.description =
      typeof body.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : null;
  }
  if (body.tags !== undefined) {
    const cleaned = normalizeTags(body.tags);
    if (cleaned === null) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
    }
    updates.tags = cleaned;
  }
  if (body.shareable !== undefined) {
    updates.shareable = Boolean(body.shareable);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no updatable fields provided" }, { status: 400 });
  }

  try {
    const asset = await updateAsset(id, updates);
    return NextResponse.json({ asset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("PUT /api/admin/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  try {
    await deleteAsset(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("DELETE /api/admin/assets failed:", JSON.stringify({ message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

**Step 3: Smoke the auth gate**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/assets
```
Expected: `401`.

**Step 4: Smoke a full create + list + update + delete cycle**

The user must first log in to `/admin` in their browser to seed the `admin_session` cookie, then export it and pass via `--cookie`. Easier path: do this from the admin UI in Task 7. **Skip curl for the authed routes** — verify them via the UI.

**Step 5: Commit**

```bash
git add src/app/api/admin/assets/route.ts
git commit -m "Add admin CRUD API for assets"
```

---

## Task 6: Wire `/asset-hub` link into `Nav`, `/admin/assets` link into `/admin`

**Files:**
- Modify: `src/components/Nav.tsx`
- Modify: `src/app/admin/page.tsx`

**Step 1: Add the Asset Hub link to `Nav.tsx`**

In `src/components/Nav.tsx`, change the `links` array. Find:

```ts
const links = [
  { href: "/", label: "Link Builder" },
  { href: "/content-hub", label: "Content Hub" },
  { href: "/email-hub", label: "Email Hub" },
  { href: "/admin", label: "Admin" },
];
```

Replace with:

```ts
const links = [
  { href: "/", label: "Link Builder" },
  { href: "/content-hub", label: "Content Hub" },
  { href: "/email-hub", label: "Email Hub" },
  { href: "/asset-hub", label: "Asset Hub" },
  { href: "/admin", label: "Admin" },
];
```

**Step 2: Add the admin sub-link**

In `src/app/admin/page.tsx`, find the header block:

```tsx
<Link
  href="/admin/mentions"
  className="text-sm text-blue-600 hover:text-blue-800"
>
  Mentions →
</Link>
```

Add a sibling link directly above (or below) it:

```tsx
<Link
  href="/admin/assets"
  className="text-sm text-blue-600 hover:text-blue-800"
>
  Assets →
</Link>
```

**Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

**Step 4: Visual smoke**

In the browser:
- Visit `http://localhost:3000/` → "Asset Hub" appears in the top nav. Clicking it loads (a 404 for now is OK — page lands in Task 8).
- Visit `http://localhost:3000/admin` → after login, the "Assets →" link appears next to "Mentions →".

**Step 5: Commit**

```bash
git add src/components/Nav.tsx src/app/admin/page.tsx
git commit -m "Link Asset Hub from global nav and admin home"
```

---

## Task 7: Build the admin page `/admin/assets`

**Files:**
- Create: `src/app/admin/assets/page.tsx`

This is the largest single task. Mirrors the auth + CRUD pattern of `/admin` and `/admin/mentions`. Inline edit, no modal.

**Step 1: Write the page**

Create `src/app/admin/assets/page.tsx`:

```tsx
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
```

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

**Step 3: Manual smoke (browser)**

With `npm run dev` running:
1. Visit `http://localhost:3000/admin/assets` → if not logged in, the password prompt appears.
2. Log in with `ADMIN_PASSWORD`.
3. Add this real asset (use the URL the user supplied):
   - Title: `Tax year-end checklist`
   - URL: `https://www.datocms-assets.com/137998/1770100454-tax-year-checklist-1.pdf?ts=508fab77&dl=tax-year-checklist-1.pdf`
   - Description: `Quick reference for end-of-tax-year planning`
   - Tags: `tax, checklist, year-end`
   - Shareable: ✓
4. Click "Add asset". Row appears with green "Shareable" badge and three tag chips.
5. Click "Edit" → change title to `Tax year-end checklist 2025`, save. Row updates.
6. Click "Delete" → confirm "Yes" → row disappears. Re-add it for the rep-side smoke in Task 9.

**Step 4: Commit**

```bash
git add src/app/admin/assets/page.tsx
git commit -m "Add admin assets CRUD page"
```

---

## Task 8: Build the rep-facing `/asset-hub` page

**Files:**
- Create: `src/app/asset-hub/page.tsx`

The page reuses three patterns from `src/app/page.tsx`:
- Searchable rep combobox.
- Channel toggle (linkedin / email).
- UTM-build + shorten flow.

We do **not** extract these into shared components in this task — `/asset-hub` is the only second consumer and the YAGNI rule says wait for the third. Inline copy them.

**Step 1: Write the page**

Create `src/app/asset-hub/page.tsx`:

```tsx
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
      const res = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: utmUrl }),
      });
      const data = await res.json();
      const finalUrl = data?.shortUrl ?? utmUrl;
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
```

**Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

**Step 3: Browser smoke**

With `npm run dev` running and at least one shareable asset added in Task 7:
1. Visit `http://localhost:3000/asset-hub`. Page loads with the rep picker, channel toggle, search box, tag chips, and a card grid.
2. Click "Copy tracked link" *without* picking a rep → red helper text appears: "Pick your name first…".
3. Pick a rep from the combobox → reload the page → the rep is still selected (localStorage).
4. Click "Copy tracked link" → button flips to "Copied!"; paste into the address bar — URL should be a Short.io short link.
5. Manually expand the short link (visit it once) → confirm the destination has all five params: `utm_source=linkedin`, `utm_medium=social`, `utm_campaign=<rep-slug>`, `utm_content=<title-slug>`, `sc_id=<rep-or-default>`.
6. Toggle channel to Email → click "Copy tracked link" again → confirm the new URL has `utm_source=email&utm_medium=email`.
7. Add a non-shareable asset (in admin) → confirm the card shows only a "Download" button (no UTM, opens raw URL in a new tab).
8. Click a tag chip → grid narrows. Click another tag → narrows further (AND). Click "Clear" → grid resets.
9. Type into the search box → grid narrows by title.

**Step 4: Commit**

```bash
git add src/app/asset-hub/page.tsx
git commit -m "Add rep-facing /asset-hub page"
```

---

## Task 9: Update `CLAUDE.md` with the new routes and table

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Read the current `Project Structure` block**

```bash
grep -n "Project Structure" CLAUDE.md
```

**Step 2: Add lines under `app/`**

Find:

```
    admin/mentions/page.tsx      # Hidden admin page - press/media mentions list + Google Alert feeds CRUD
```

Add a sibling line below it:

```
    admin/assets/page.tsx        # Admin CRUD for the Asset Hub (PDFs by URL + tags + shareable flag)
    asset-hub/page.tsx           # Public Asset Hub - searchable/tagged PDF library, tracked share links
```

Find the `api/` block and add:

```
      assets/route.ts            # GET (public) - list assets for /asset-hub
      admin/assets/route.ts      # GET/POST/PUT/DELETE assets (admin auth, id-in-body for PUT/DELETE)
```

In the `scripts/migrations/` block, add:

```
    003_assets.sql           # assets table for Asset Hub
```

**Step 3: Add a bullet to the "Important Notes" section**

Add at the end of that list:

```
- Asset Hub stores **only URLs** to PDFs hosted elsewhere (e.g. datocms). No file uploads. The `assets` table must be created via `scripts/migrations/003_assets.sql` before deploy.
- Asset Hub admin CRUD lives at `/admin/assets`; public browse at `/asset-hub` (linked from the global Nav).
```

**Step 4: Type-check (sanity, doc-only change)**

Run: `npx tsc --noEmit`
Expected: exits 0.

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Document Asset Hub routes and migration in CLAUDE.md"
```

---

## Task 10: Build & deploy verification

**Files:** none (verification only)

**Step 1: Production build**

Run: `npm run build`
Expected: build succeeds, no type errors. Note the new routes in the route summary:
- `ƒ /asset-hub`
- `ƒ /admin/assets`
- `ƒ /api/assets`
- `ƒ /api/admin/assets`

**Step 2: Push to main**

The deployment workflow for this repo is "commit directly to main" (memory). After all task commits land:

```bash
git push origin main
```

Vercel auto-deploys. Watch the deploy status in the Vercel dashboard.

**Step 3: Production smoke**

After Vercel deploy finishes, repeat the manual smoke from Task 7 and Task 8 against the production URL. Pay particular attention to:
- The Supabase data-cache leak (memory: confirm a freshly-edited asset shows up immediately on `/asset-hub` without a hard refresh — `getSupabase()` already wraps fetch with `cache: "no-store"` so this should Just Work, but verify).
- The Short.io shortening succeeds in production (env vars already set).

**Step 4: No commit needed** — this is verification only.

---

## Done criteria

- [ ] `003_assets.sql` migration applied in Supabase.
- [ ] `Asset` type exported from `src/lib/types.ts`.
- [ ] `src/lib/assets.ts` has `listAssets`, `createAsset`, `updateAsset`, `deleteAsset`.
- [ ] `GET /api/assets` returns the public list.
- [ ] `GET/POST/PUT/DELETE /api/admin/assets` work behind `admin_session`.
- [ ] `/admin/assets` allows add / inline-edit / delete.
- [ ] `/asset-hub` lists assets, filters by search + tags (AND), supports rep picker + channel toggle.
- [ ] Shareable assets produce a Short.io URL on "Copy tracked link" with all five params.
- [ ] Non-shareable assets show only "Download".
- [ ] Both pages reachable from `Nav.tsx`.
- [ ] `CLAUDE.md` updated.
- [ ] Production deploy green and smoked.

---

## Out of scope (do not add)

- File uploads / Supabase Storage.
- Thumbnails or PDF previews.
- Tag rename / merge UI.
- Per-asset analytics in our DB.
- Soft delete or version history.
- Bulk CSV import.
- Extracting `RepPicker` / `ChannelToggle` into shared components — wait until a third consumer.
