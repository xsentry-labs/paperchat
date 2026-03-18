"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Conversation } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ConversationWithDoc extends Conversation {
  documents?: { filename: string };
}

export function ConversationList() {
  const [conversations, setConversations] = useState<ConversationWithDoc[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    const res = await fetch("/api/conversations");
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);

    const res = await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (pathname === `/chat/${id}`) {
        router.push("/");
      }
    }
  }

  if (conversations.length === 0) return null;

  const confirmConv = conversations.find((c) => c.id === confirmDeleteId);

  return (
    <div className="border-t border-border pt-2">
      <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Conversations
      </p>
      <ul className="space-y-0.5 px-2">
        {conversations.map((conv) => {
          const isActive = pathname === `/chat/${conv.id}`;
          return (
            <li key={conv.id}>
              <button
                onClick={() => router.push(`/chat/${conv.id}`)}
                className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span className="flex-1 truncate">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(conv.id);
                  }}
                  className="hidden group-hover:block text-muted-foreground hover:text-destructive text-xs px-1"
                  title="Delete conversation"
                >
                  ✕
                </button>
              </button>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete conversation?"
        message={`"${confirmConv?.title}" and all its messages will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
