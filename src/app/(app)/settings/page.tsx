"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MODELS, type ModelKey } from "@/lib/llm";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [preferredModel, setPreferredModel] = useState<ModelKey>("fast");
  const [docCount, setDocCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setEmail(user.email ?? "");

      const profileRes = await fetch("/api/profile");
      if (profileRes.ok) {
        const { profile } = await profileRes.json();
        if (profile?.preferred_model && profile.preferred_model in MODELS) {
          setPreferredModel(profile.preferred_model as ModelKey);
        }
      }

      const docsRes = await fetch("/api/documents");
      if (docsRes.ok) {
        const { documents } = await docsRes.json();
        setDocCount(documents.length);
        setTotalSize(documents.reduce((sum: number, d: { size_bytes: number }) => sum + d.size_bytes, 0));
      }
    }
    load();
  }, []);

  async function handleSaveModel() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_model: preferredModel }),
    });
    setSaving(false);
    setMessage(res.ok ? "Model preference saved." : "Failed to save.");
  }

  async function handleDeleteAll() {
    if (!confirm("Delete all documents? This cannot be undone.")) return;
    setDeleting(true);
    const docsRes = await fetch("/api/documents");
    if (docsRes.ok) {
      const { documents } = await docsRes.json();
      for (const doc of documents) {
        await fetch(`/api/documents?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      }
    }
    setDeleting(false);
    setDocCount(0);
    setTotalSize(0);
    setMessage("All documents deleted.");
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10 space-y-10">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      {message && (
        <div className="rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      {/* Account */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Account</h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground">{email}</span>
          </div>
        </div>
      </section>

      {/* Model preference */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Default model</h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="space-y-2">
            {(Object.entries(MODELS) as [ModelKey, typeof MODELS[ModelKey]][]).map(
              ([key, model]) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                    preferredModel === key ? "bg-secondary" : "hover:bg-secondary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={key}
                    checked={preferredModel === key}
                    onChange={() => setPreferredModel(key)}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{model.label}</p>
                    <p className="text-xs text-muted-foreground">{model.description}</p>
                  </div>
                </label>
              )
            )}
          </div>
          <Button onClick={handleSaveModel} loading={saving} size="sm">
            Save preference
          </Button>
        </div>
      </section>

      {/* Storage */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Storage</h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Documents</span>
            <span className="text-foreground">{docCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total size</span>
            <span className="text-foreground">{formatSize(totalSize)}</span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteAll}
            loading={deleting}
          >
            Delete all documents
          </Button>
        </div>
      </section>

      {/* Sign out */}
      <section>
        <Button variant="secondary" onClick={handleSignOut}>
          Sign out
        </Button>
      </section>
    </div>
  );
}
