"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ChatMessage } from "@/lib/types";
import type { ModelKey } from "@/lib/llm";
import { Button } from "@/components/ui/button";
import { CitationCard } from "./CitationCard";
import { ModelSelector } from "./ModelSelector";

interface ChatPanelProps {
  conversationId: string;
  documentFilename: string;
}

interface Citation {
  ref: number;
  documentId: string;
  filename: string;
  page: number | null;
  quote: string;
}

export function ChatPanel({ conversationId, documentFilename }: ChatPanelProps) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<Record<string, Citation[]>>({});
  const [inputValue, setInputValue] = useState("");
  const [currentModel, setCurrentModel] = useState<ModelKey>("fast");
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing messages + user model preference
  useEffect(() => {
    async function load() {
      const [msgRes, profileRes] = await Promise.all([
        fetch(`/api/conversations/${conversationId}/messages`),
        fetch("/api/profile"),
      ]);

      if (msgRes.ok) {
        const data = await msgRes.json();
        setHistory(data.messages);
        const citMap: Record<string, Citation[]> = {};
        for (const msg of data.messages) {
          if (msg.role === "assistant" && msg.sources) {
            citMap[msg.id] = msg.sources;
          }
        }
        setCitations(citMap);
      }

      if (profileRes.ok) {
        const { profile } = await profileRes.json();
        if (profile?.preferred_model) {
          setCurrentModel(profile.preferred_model as ModelKey);
        }
      }
    }
    load();
  }, [conversationId]);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/query",
      body: { conversationId },
    }),
    onError(err) {
      if (err.message?.includes("daily_limit_reached")) {
        setChatError("You've reached your daily limit of 50 queries. Resets at midnight.");
      } else {
        setChatError(err.message || "Something went wrong. Please try again.");
      }
    },
    onFinish() {
      setChatError(null);
      fetch(`/api/conversations/${conversationId}/messages`)
        .then((res) => res.json())
        .then((data) => {
          setHistory(data.messages);
          const citMap: Record<string, Citation[]> = {};
          for (const msg of data.messages) {
            if (msg.role === "assistant" && msg.sources) {
              citMap[msg.id] = msg.sources;
            }
          }
          setCitations(citMap);
        });
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, history]);

  function getTextContent(msg: { parts?: Array<{ type: string; text?: string }>; content?: string }): string {
    if (msg.parts) {
      return msg.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
    }
    return (msg as { content?: string }).content ?? "";
  }

  const streamingMessages = messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: getTextContent(m),
  }));

  const historyIds = new Set(history.map((h) => h.content));
  const displayMessages = [
    ...history,
    ...streamingMessages.filter((m) => !historyIds.has(m.content)),
  ];

  function renderContent(content: string) {
    return content.split(/(\[\d+\])/).map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        return (
          <span
            key={i}
            className="inline-flex items-center rounded bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary cursor-default"
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    setChatError(null);
    const text = inputValue;
    setInputValue("");
    await sendMessage({ text });
  }

  async function handleModelChange(model: ModelKey) {
    setCurrentModel(model);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_model: model }),
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-6">
        <p className="text-sm text-muted-foreground">
          Chatting with <span className="text-foreground font-medium">{documentFilename}</span>
        </p>
        <ModelSelector currentModel={currentModel} onSelect={handleModelChange} />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {displayMessages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-muted-foreground text-sm">
              Ask a question about this document to get started.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "What is this document about?",
                "Summarize the key points",
                "What are the main conclusions?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInputValue(q);
                  }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
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
            <div key={msg.id || i} className="space-y-2">
              <div
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {msg.role === "assistant"
                    ? renderContent(content)
                    : content}
                </div>
              </div>

              {msg.role === "assistant" && citations[msg.id] && (
                <div className="ml-0 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {citations[msg.id].map((cit) => (
                    <CitationCard key={cit.ref} citation={cit} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-secondary px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.2s]" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}

        {chatError && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              {chatError}
              <button
                onClick={() => setChatError(null)}
                className="ml-2 underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask a question about this document..."
            className="flex-1 rounded-lg border border-border bg-input px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isLoading}
          />
          <Button type="submit" loading={isLoading} disabled={!inputValue.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
