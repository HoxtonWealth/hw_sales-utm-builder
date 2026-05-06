"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Rep } from "@/lib/types";

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [reps, setReps] = useState<Rep[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [scIdInput, setScIdInput] = useState("");
  const [scIdSaved, setScIdSaved] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPromptSaved, setAiPromptSaved] = useState(false);

  const [repSearch, setRepSearch] = useState("");
  const [editingRep, setEditingRep] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editScId, setEditScId] = useState("");

  const [addingRep, setAddingRep] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScId, setNewScId] = useState("");

  const [deletingRep, setDeletingRep] = useState<string | null>(null);

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
      } else {
        setAuthError("Invalid password");
      }
    } catch {
      setAuthError("Something went wrong");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    setLoggedIn(false);
  }

  useEffect(() => {
    if (!loggedIn) return;
    setDataLoading(true);
    Promise.all([
      fetch("/api/reps").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([repsData, settingsData]) => {
      setReps(repsData);
      setScIdInput(settingsData.value);
      setAiPrompt(settingsData.aiPrompt || "");
      setDataLoading(false);
    });
  }, [loggedIn]);

  async function saveDefaultScId() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: scIdInput }),
    });
    setScIdSaved(true);
    setTimeout(() => setScIdSaved(false), 2000);
  }

  async function saveAiPrompt() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiPrompt }),
    });
    setAiPromptSaved(true);
    setTimeout(() => setAiPromptSaved(false), 2000);
  }

  async function handleAddRep() {
    if (!newName.trim()) return;
    const res = await fetch("/api/reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), sc_id: newScId.trim() || null }),
    });
    if (res.ok) {
      const updated = await fetch("/api/reps").then((r) => r.json());
      setReps(updated);
      setAddingRep(false);
      setNewName("");
      setNewScId("");
    }
  }

  async function handleEditRep(oldName: string) {
    if (!editName.trim()) return;
    const res = await fetch("/api/reps", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldName,
        name: editName.trim(),
        sc_id: editScId.trim() || null,
      }),
    });
    if (res.ok) {
      const updated = await fetch("/api/reps").then((r) => r.json());
      setReps(updated);
      setEditingRep(null);
    }
  }

  async function handleDeleteRep(name: string) {
    const res = await fetch("/api/reps", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setReps(reps.filter((r) => r.name !== name));
      setDeletingRep(null);
    }
  }

  const filteredReps = reps.filter((r) =>
    r.name.toLowerCase().includes(repSearch.toLowerCase())
  );

  // Login screen
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

  // Dashboard
  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-8 pb-16">
      <div className="mx-auto max-w-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Admin settings</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/assets"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Assets →
            </Link>
            <Link
              href="/admin/mentions"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Mentions →
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>

        {dataLoading ? (
          <div className="mt-8 text-center text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Default SC_ID */}
            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Default SC_ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scIdInput}
                  onChange={(e) => setScIdInput(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={saveDefaultScId}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                >
                  {scIdSaved ? "Saved!" : "Save"}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Applied when a rep has no assigned SC_ID
              </p>
            </div>

            {/* AI System Prompt */}
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                AI post writer — system prompt
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                placeholder="e.g. You are a social media copywriter for Hoxton Wealth..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Sets the tone and persona for AI-generated posts in the Content Hub
                </p>
                <button
                  onClick={saveAiPrompt}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                >
                  {aiPromptSaved ? "Saved!" : "Save"}
                </button>
              </div>
            </div>

            {/* Sales Reps */}
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">
                  Sales reps ({reps.length})
                </h2>
                <button
                  onClick={() => {
                    setAddingRep(true);
                    setNewName("");
                    setNewScId("");
                  }}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  + Add rep
                </button>
              </div>

              <input
                type="text"
                value={repSearch}
                onChange={(e) => setRepSearch(e.target.value)}
                placeholder="Search reps..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-md">
                {/* Header */}
                <div className="grid grid-cols-[1fr_120px_100px] gap-2 px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 sticky top-0 border-b border-gray-200">
                  <span>Name</span>
                  <span>SC_ID</span>
                  <span className="text-right">Actions</span>
                </div>

                {/* Add new row */}
                {addingRep && (
                  <div className="grid grid-cols-[1fr_120px_100px] gap-2 px-3 py-2 border-b border-gray-100 bg-blue-50">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Name"
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={newScId}
                      onChange={(e) => setNewScId(e.target.value)}
                      placeholder="SC_ID"
                      className="rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={handleAddRep}
                        className="text-xs text-green-600 hover:text-green-800 font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setAddingRep(false)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Rep rows */}
                {filteredReps.map((rep) => (
                  <div
                    key={rep.name}
                    className="grid grid-cols-[1fr_120px_100px] gap-2 px-3 py-2 border-b border-gray-100 text-sm"
                  >
                    {editingRep === rep.name ? (
                      <>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <input
                          type="text"
                          value={editScId}
                          onChange={(e) => setEditScId(e.target.value)}
                          placeholder="default"
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => handleEditRep(rep.name)}
                            className="text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingRep(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : deletingRep === rep.name ? (
                      <>
                        <span className="text-xs text-gray-900">{rep.name}</span>
                        <span className="text-xs text-red-500">Sure?</span>
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => handleDeleteRep(rep.name)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeletingRep(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            No
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-gray-900">{rep.name}</span>
                        <span className="text-xs text-gray-400 italic">
                          {rep.sc_id || "default"}
                        </span>
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => {
                              setEditingRep(rep.name);
                              setEditName(rep.name);
                              setEditScId(rep.sc_id || "");
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingRep(rep.name)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {filteredReps.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-gray-400">
                    No reps match your search
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
