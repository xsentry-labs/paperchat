"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ALL_MODELS, DEFAULT_MODEL_ID, PROVIDER_LABELS, COST_TIER_LABELS } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [preferredModel, setPreferredModel] = useState<string>(DEFAULT_MODEL_ID);
  const [docCount, setDocCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // For anonymous account creation
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertSuccess, setConvertSuccess] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? "");
        setIsAnonymous((user as { is_anonymous?: boolean }).is_anonymous ?? false);
      }

      const profileRes = await fetch("/api/profile");
      if (profileRes.ok) {
        const { profile } = await profileRes.json();
        if (profile?.preferred_model) {
          setPreferredModel(profile.preferred_model as string);
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
    setDeleting(true);
    setShowDeleteConfirm(false);
    const docsRes = await fetch("/api/documents");
    if (docsRes.ok) {
      const { documents } = await docsRes.json();
      await Promise.all(
        documents.map((doc: { id: string }) =>
          fetch(`/api/documents?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" })
        )
      );
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

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setConvertError(null);
    setConvertLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail, password: newPassword });
    if (error) {
      setConvertError(error.message);
      setConvertLoading(false);
      return;
    }
    setConvertSuccess(true);
    setConvertLoading(false);
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-6 sm:py-10 space-y-8 sm:space-y-10">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground pl-10 md:pl-0">Settings</h1>

      {message && (
        <div className="rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      {/* Create account - only for guests */}
      {isAnonymous && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Create Account</h2>
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            {convertSuccess ? (
              <p className="text-sm text-foreground">
                Check your email to confirm your account. Your documents and conversations will be preserved.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Create an account to keep your documents and conversations across sessions.
                </p>
                <form onSubmit={handleCreateAccount} className="space-y-3">
                  <Input
                    id="new-email"
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                  <Input
                    id="new-password"
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  {convertError && (
                    <p className="text-sm text-destructive">{convertError}</p>
                  )}
                  <Button type="submit" loading={convertLoading} size="sm">
                    Create account
                  </Button>
                </form>
              </>
            )}
          </div>
        </section>
      )}

      {/* Account - only for registered users */}
      {!isAnonymous && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Account</h2>
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="text-foreground">{email}</span>
            </div>
          </div>
        </section>
      )}

      {/* Model preference */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Default model</h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground/60">
              Non-OpenAI models require <code className="text-muted-foreground">OPENROUTER_API_KEY</code>.
            </p>
            {/* Group by provider */}
            {(["openai", "anthropic", "google", "meta", "mistral", "deepseek"] as const).map((provider) => {
              const providerModels = ALL_MODELS.filter((m) => m.provider === provider);
              return (
                <div key={provider}>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-1">
                    {PROVIDER_LABELS[provider]}
                  </p>
                  <div className="space-y-1">
                    {providerModels.map((model) => (
                      <label
                        key={model.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                          preferredModel === model.id ? "bg-secondary" : "hover:bg-secondary/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="model"
                          value={model.id}
                          checked={preferredModel === model.id}
                          onChange={() => setPreferredModel(model.id)}
                          className="accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{model.label}</p>
                          <p className="text-xs text-muted-foreground">{model.description}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground/40 shrink-0">
                          {COST_TIER_LABELS[model.costTier]} · {model.contextK}k
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
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
            onClick={() => setShowDeleteConfirm(true)}
            loading={deleting}
            disabled={docCount === 0}
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

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete all documents?"
        message="This will permanently delete all your documents and conversations. This cannot be undone."
        confirmLabel="Delete all"
        onConfirm={handleDeleteAll}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
