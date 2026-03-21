"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Conversation } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSidebar } from "./SidebarProvider";

interface ConversationWithDoc extends Conversation {
  documents?: { filename: string };
}

export function Sidebar() {
  const [conversations, setConversations] = useState<ConversationWithDoc[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { collapsed } = useSidebar();

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) setConversations((await res.json()).conversations);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  async function handleNewChat() {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New chat" }),
    });
    if (res.ok) {
      const data = await res.json();
      await fetchConversations();
      router.push(`/chat/${data.conversation.id}`);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setConversations((p) => p.filter((c) => c.id !== id));
      if (pathname === `/chat/${id}`) router.push("/");
    }
  }

  // Collapsed: icon-only compact sidebar
  if (collapsed) {
    return (
      <div className="hidden md:flex flex-col h-full items-center py-1 gap-1">
        {/* New chat */}
        <button
          onClick={handleNewChat}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-hover transition-all duration-150"
          title="New chat"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* Artifacts */}
        <button
          onClick={() => router.push("/artifacts")}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-100 ${
            pathname === "/artifacts"
              ? "bg-hover text-foreground"
              : "text-muted-foreground hover:bg-hover hover:text-foreground"
          }`}
          title="Artifacts"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
        </button>

        {/* Activity */}
        <button
          onClick={() => router.push("/activity")}
          className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-100 ${
            pathname === "/activity"
              ? "bg-hover text-foreground"
              : "text-muted-foreground hover:bg-hover hover:text-foreground"
          }`}
          title="Activity"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
          </svg>
        </button>

        {/* Divider */}
        <div className="w-6 border-t border-border/50 my-1" />

        {/* Conversation icons */}
        <div className="flex-1 overflow-y-auto w-full flex flex-col items-center gap-0.5 px-1">
          {conversations.map((conv) => {
            const isActive = pathname === `/chat/${conv.id}`;
            return (
              <button
                key={conv.id}
                onClick={() => router.push(`/chat/${conv.id}`)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-100 shrink-0 ${
                  isActive
                    ? "bg-hover text-foreground"
                    : "text-muted-foreground/50 hover:bg-hover hover:text-foreground"
                }`}
                title={conv.title}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Expanded: full sidebar (also used for mobile drawer)
  return (
    <div className="flex flex-col h-full">
      {/* New chat */}
      <div className="px-3 pt-1 pb-2">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-hover transition-all duration-150"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>
      </div>

      {/* Nav links */}
      <div className="px-2 pb-1 space-y-px">
        <button
          onClick={() => router.push("/artifacts")}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-all duration-100 ${
            pathname === "/artifacts"
              ? "bg-hover text-foreground"
              : "text-muted-foreground hover:bg-hover hover:text-foreground"
          }`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          Artifacts
        </button>

        <button
          onClick={() => router.push("/activity")}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-all duration-100 ${
            pathname === "/activity"
              ? "bg-hover text-foreground"
              : "text-muted-foreground hover:bg-hover hover:text-foreground"
          }`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
          </svg>
          Activity
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.length === 0 ? (
          <p className="px-2 py-12 text-center text-[11px] text-muted-foreground/40">
            No conversations yet
          </p>
        ) : (
          <ul className="space-y-px">
            {conversations.map((conv) => {
              const isActive = pathname === `/chat/${conv.id}`;
              return (
                <li key={conv.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/chat/${conv.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") router.push(`/chat/${conv.id}`); }}
                    className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left cursor-pointer overflow-hidden transition-all duration-100 ${
                      isActive
                        ? "bg-hover text-foreground"
                        : "text-muted-foreground hover:bg-hover hover:text-foreground"
                    }`}
                  >
                    <svg className="h-3.5 w-3.5 shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                    <span className="flex-1 text-xs truncate">{conv.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: conv.id, label: conv.title }); }}
                      className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground/40 hover:text-destructive text-[10px] transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete conversation?"
        message={`"${confirmDelete?.label}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
