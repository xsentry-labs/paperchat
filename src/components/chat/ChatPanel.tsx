"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ChatMessage } from "@/lib/types";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { CitationCard } from "./CitationCard";
import { MarkdownContent } from "./MarkdownContent";
import { ModelSelector } from "./ModelSelector";

interface ChatPanelProps {
  conversationId: string;
  documentFilename: string;
  initialQuestion?: string;
}

interface Citation {
  ref: number;
  documentId: string;
  filename: string;
  page: number | null;
  quote: string;
}

const STARTERS = [
  "What is this document about?",
  "Summarize the key points",
  "What are the main conclusions?",
];

function SourcesCollapsible({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  const [expandedRef, setExpandedRef] = useState<number | null>(null);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <svg
          className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {citations.length} source{citations.length !== 1 ? "s" : ""}
      </button>
      {open && (
        <div className="mt-2 space-y-px animate-fade-in">
          {citations.map((cit) => (
            <div key={cit.ref}>
              <button
                onClick={() => setExpandedRef(expandedRef === cit.ref ? null : cit.ref)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-all duration-100 ${
                  expandedRef === cit.ref
                    ? "bg-hover"
                    : "hover:bg-hover/60"
                }`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-medium text-muted-foreground bg-hover">
                  {cit.ref}
                </span>
                <span className="flex-1 text-[11px] text-foreground/70 truncate">
                  {cit.filename}
                  {cit.page && (
                    <span className="text-muted-foreground/50 ml-1">p.{cit.page}</span>
                  )}
                </span>
                <svg
                  className={`h-2.5 w-2.5 shrink-0 text-muted-foreground/30 transition-transform duration-150 ${expandedRef === cit.ref ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedRef === cit.ref && (
                <div className="mx-2.5 mb-2 mt-1 rounded-md border border-border/40 bg-card/30 p-3 animate-fade-in">
                  <div className="flex gap-4 text-[10px] text-muted-foreground/50 mb-2">
                    <span>Document: <span className="text-foreground/60">{cit.filename}</span></span>
                    {cit.page && <span>Page: <span className="text-foreground/60">{cit.page}</span></span>}
                    <span>Ref: <span className="text-foreground/60">[{cit.ref}]</span></span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-foreground/70 break-words">
                    {cit.quote}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ conversationId, initialQuestion }: ChatPanelProps) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<Record<string, Citation[]>>({});
  const [inputValue, setInputValue] = useState("");
  const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL_ID);
  const [chatError, setChatError] = useState<string | null>(null);
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const [msgRes, profileRes, rateLimitRes] = await Promise.all([
        fetch(`/api/conversations/${conversationId}/messages`),
        fetch("/api/profile"),
        fetch("/api/rate-limit"),
      ]);
      if (msgRes.ok) {
        const data = await msgRes.json();
        setHistory(data.messages);
        const citMap: Record<string, Citation[]> = {};
        for (const msg of data.messages) {
          if (msg.role === "assistant" && msg.sources) citMap[msg.id] = msg.sources;
        }
        setCitations(citMap);
      }
      if (profileRes.ok) {
        const { profile } = await profileRes.json();
        if (profile?.preferred_model) setCurrentModel(profile.preferred_model as string);
      }
      if (rateLimitRes.ok) {
        setRateLimitRemaining((await rateLimitRes.json()).remaining);
      }
    }
    load();
  }, [conversationId]);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/query", body: { conversationId } }),
    onError(err) {
      if (err.message?.includes("daily_limit_reached")) {
        setChatError("Daily limit reached. Resets at midnight.");
        setRateLimitRemaining(0);
      } else {
        setChatError(err.message || "Something went wrong.");
      }
    },
    onFinish() {
      setChatError(null);
      window.dispatchEvent(new Event("conversation-updated"));
      setTimeout(() => {
        Promise.all([
          fetch(`/api/conversations/${conversationId}/messages`).then((r) => r.json()),
          fetch("/api/rate-limit").then((r) => r.json()),
        ]).then(([msgData, rlData]) => {
          setHistory(msgData.messages);
          const citMap: Record<string, Citation[]> = {};
          for (const msg of msgData.messages) {
            if (msg.role === "assistant" && msg.sources) citMap[msg.id] = msg.sources;
          }
          setCitations(citMap);
          setRateLimitRemaining(rlData.remaining ?? null);
        });
      }, 1500);
    },
  });

  const isLoading = status === "submitted" || status === "streaming";
  const initialSent = useRef(false);

  // Auto-send initial question from home page redirect
  useEffect(() => {
    if (initialQuestion && !initialSent.current && status === "ready") {
      initialSent.current = true;
      sendMessage({ text: initialQuestion });
    }
  }, [initialQuestion, status, sendMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, history]);

  function getTextContent(msg: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
    if (msg.parts) return msg.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
    return (msg as { content?: string }).content ?? "";
  }

  const streamingMessages = messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: getTextContent(m) }));
  const historyIds = new Set(history.map((h) => h.content));
  const displayMessages = [...history, ...streamingMessages.filter((m) => !historyIds.has(m.content))];

  async function submitMessage(text: string) {
    if (!text.trim() || isLoading) return;
    setChatError(null);
    setInputValue("");
    await sendMessage({ text });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitMessage(inputValue);
  }

  async function handleModelChange(model: string) {
    setCurrentModel(model);
    fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferred_model: model }) });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
          {displayMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-20 sm:pt-32 gap-4 sm:gap-6 px-2">
              <p className="text-sm text-muted-foreground/60 text-center">
                Ask anything about your documents.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((q) => (
                  <button
                    key={q}
                    onClick={() => submitMessage(q)}
                    className="rounded-full border border-border/60 px-3 sm:px-3.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-border hover:bg-hover transition-all duration-150"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {displayMessages.map((msg, i) => {
            const content = "content" in msg ? msg.content : "";
            return (
              <div key={msg.id || i} className="animate-fade-in">
                {msg.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[80%] rounded-2xl bg-hover px-3 sm:px-4 py-2 sm:py-2.5 text-sm text-foreground break-words overflow-hidden">
                      {content}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Assistant message - no bubble, just content */}
                    <div className="max-w-full overflow-hidden">
                      <MarkdownContent content={content} />
                    </div>

                    {citations[msg.id] && citations[msg.id].length > 0 && (
                      <SourcesCollapsible citations={citations[msg.id]} />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {status === "submitted" && (
            <div className="animate-fade-in">
              <div className="flex gap-1 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:0.15s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          )}

          {chatError && (
            <div className="rounded-lg bg-destructive/5 border border-destructive/10 px-4 py-3 text-xs text-destructive animate-fade-in">
              {chatError}
              <button onClick={() => setChatError(null)} className="ml-2 text-destructive/50 hover:text-destructive">
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border/50">
        <div className="mx-auto max-w-2xl px-3 sm:px-4 py-2 sm:py-3">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submitMessage(inputValue); } }}
              placeholder="Ask a question..."
              className="w-full rounded-xl border border-border/60 bg-transparent pl-3 sm:pl-4 pr-20 sm:pr-36 py-2.5 sm:py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-border transition-colors"
              disabled={isLoading || rateLimitRemaining === 0}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2">
              <div className="hidden sm:block">
                <ModelSelector currentModel={currentModel} onSelect={handleModelChange} />
              </div>
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading || rateLimitRemaining === 0}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background transition-all duration-150 hover:bg-foreground/80 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                {isLoading ? (
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
    </div>
  );
}
