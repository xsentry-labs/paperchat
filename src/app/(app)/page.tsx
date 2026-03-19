"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ModelSelector } from "@/components/chat/ModelSelector";
import type { ModelKey } from "@/lib/llm";

export default function HomePage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelKey>("fast");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/profile").then(async (res) => {
      if (res.ok) {
        const { profile } = await res.json();
        if (profile?.preferred_model) setCurrentModel(profile.preferred_model as ModelKey);
      }
    });
  }, []);

  function handleModelChange(model: ModelKey) {
    setCurrentModel(model);
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_model: model }),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);

    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: text.slice(0, 60) }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/chat/${data.conversation.id}?q=${encodeURIComponent(text)}`);
    } else {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-medium text-foreground tracking-tight">
            paperchat
          </h2>
          <p className="text-xs text-muted-foreground/50">
            Ask anything. Upload documents for grounded answers.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            autoFocus
            className="w-full rounded-xl border border-border/60 bg-transparent pl-3 sm:pl-4 pr-20 sm:pr-36 py-3 sm:py-3.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-border transition-colors"
            disabled={loading}
          />
          <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:block">
              <ModelSelector currentModel={currentModel} onSelect={handleModelChange} />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background transition-all duration-150 hover:bg-foreground/80 disabled:opacity-20 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
