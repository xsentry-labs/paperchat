"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@/lib/types";
import { POLLING_INTERVAL, MAX_FILE_SIZE } from "@/lib/constants";
import { FileIcon } from "./FileIcon";
import { StatusDot } from "./StatusDot";
import { UploadButton } from "./UploadButton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PAGE_SIZE = 20;

export function FileExplorer() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) return;
      const data = await res.json();
      setDocuments(data.documents);
    } catch {
      // Silently fail on polling errors
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Poll when any document is pending/processing
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === "pending" || d.status === "processing"
    );

    if (hasPending && !pollingRef.current) {
      pollingRef.current = setInterval(fetchDocuments, POLLING_INTERVAL);
    } else if (!hasPending && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [documents, fetchDocuments]);

  async function handleUpload(file: File) {
    // Client-side size check before upload
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Upload failed");
        return;
      }

      // Refresh list
      await fetchDocuments();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDeleteId) return;
    const docId = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(docId);

    try {
      const res = await fetch(`/api/documents?id=${encodeURIComponent(docId)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Delete failed");
        return;
      }

      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setError("Delete failed. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStartChat(doc: Document) {
    if (doc.status !== "ready") return;

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: doc.id,
          title: doc.filename,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to start conversation");
        return;
      }

      const data = await res.json();
      router.push(`/chat/${data.conversation.id}`);
    } catch {
      setError("Failed to start conversation.");
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const hasPending = documents.some(
    (d) => d.status === "pending" || d.status === "processing"
  );
  const confirmDoc = documents.find((d) => d.id === confirmDeleteId);
  const visibleDocs = documents.slice(0, page * PAGE_SIZE);
  const hasMore = documents.length > page * PAGE_SIZE;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2">
        <UploadButton onFileSelect={handleUpload} loading={uploading} />
        {hasPending && (
          <p className="text-xs text-muted-foreground text-center animate-pulse">
            Processing document…
          </p>
        )}
      </div>

      {error && (
        <div className="mx-3 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 text-destructive/60 hover:text-destructive"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Documents
        </p>
        {documents.length === 0 ? (
          <div className="px-2 py-8 text-center space-y-1">
            <p className="text-sm text-muted-foreground">No documents yet</p>
            <p className="text-xs text-muted-foreground">
              Upload a PDF, Word doc, or text file to get started.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-1">
              {visibleDocs.map((doc) => (
                <li
                  key={doc.id}
                  onClick={() => handleStartChat(doc)}
                  className={`group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors ${
                    doc.status === "ready"
                      ? "cursor-pointer hover:bg-secondary"
                      : "cursor-default hover:bg-secondary/50"
                  } ${deletingId === doc.id ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <FileIcon mimeType={doc.mime_type} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-foreground" title={doc.filename}>
                      {doc.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {doc.status === "error" && doc.error_message
                        ? doc.error_message
                        : formatSize(doc.size_bytes)}
                    </p>
                  </div>
                  <StatusDot status={doc.status} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(doc.id);
                    }}
                    className="hidden group-hover:block text-muted-foreground hover:text-destructive transition-colors text-sm px-1"
                    title="Delete document"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="w-full mt-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Show {Math.min(PAGE_SIZE, documents.length - page * PAGE_SIZE)} more…
              </button>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete document?"
        message={`"${confirmDoc?.filename}" will be permanently deleted along with all associated conversations.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
