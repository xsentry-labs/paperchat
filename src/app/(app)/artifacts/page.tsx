"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import dynamic from "next/dynamic";
import type { Document } from "@/lib/types";
import { ACCEPTED_FILE_TYPES, POLLING_INTERVAL, MAX_FILE_SIZE } from "@/lib/constants";
import { StatusDot } from "@/components/file-explorer/StatusDot";
import { UploadButton } from "@/components/file-explorer/UploadButton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Dynamic import: KnowledgeGraph uses canvas APIs - must be client-only
const KnowledgeGraph = dynamic(
  () => import("@/components/graph/KnowledgeGraph").then((m) => ({ default: m.KnowledgeGraph })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center"><p className="text-xs text-muted-foreground/40 animate-pulse">Loading graph…</p></div> }
);

type FolderType = "pdf" | "txt" | "md" | "docx" | "pptx" | "xlsx" | "html" | "epub";
type TabType = "files" | "graph";

const FOLDER_COLOR = "#71717a";

const FOLDERS: { type: FolderType; label: string; mimeType: string; color: string }[] = [
  { type: "pdf",  label: "PDFs",         mimeType: "application/pdf",                                                                                  color: FOLDER_COLOR },
  { type: "docx", label: "Word",          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",                          color: FOLDER_COLOR },
  { type: "pptx", label: "Slides",        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",                        color: FOLDER_COLOR },
  { type: "xlsx", label: "Spreadsheets",  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",                                color: FOLDER_COLOR },
  { type: "txt",  label: "Text",          mimeType: "text/plain",                                                                                       color: FOLDER_COLOR },
  { type: "md",   label: "Markdown",      mimeType: "text/markdown",                                                                                    color: FOLDER_COLOR },
  { type: "html", label: "HTML",          mimeType: "text/html",                                                                                        color: FOLDER_COLOR },
  { type: "epub", label: "Books",         mimeType: "application/epub+zip",                                                                             color: FOLDER_COLOR },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function FolderIcon({ color }: { color: string }) {
  return (
    <svg className="h-12 w-12" viewBox="0 0 48 48" fill="none">
      <path
        d="M4 12C4 10.8954 4.89543 10 6 10H18L22 14H42C43.1046 14 44 14.8954 44 16V38C44 39.1046 43.1046 40 42 40H6C4.89543 40 4 39.1046 4 38V12Z"
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeOpacity={0.5}
        strokeWidth={1.5}
      />
    </svg>
  );
}

export default function ArtifactsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [openFolder, setOpenFolder] = useState<FolderType | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("files");
  const dragCounter = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDocuments = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) setDocuments((await res.json()).documents);
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  useEffect(() => {
    const hasPending = documents.some((d) => d.status === "pending" || d.status === "processing");
    if (hasPending && !pollingRef.current) {
      pollingRef.current = setInterval(fetchDocuments, POLLING_INTERVAL);
    } else if (!hasPending && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [documents, fetchDocuments]);

  async function handleUpload(file: File) {
    if (file.size > MAX_FILE_SIZE) { setError(`Max ${MAX_FILE_SIZE / 1024 / 1024}MB.`); return; }
    setUploading(true); setError(null);
    const formData = new FormData(); formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) { setError((await res.json()).error ?? "Upload failed"); return; }
      await fetchDocuments();
    } catch { setError("Upload failed."); } finally { setUploading(false); }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    const res = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((p) => p.filter((d) => d.id !== id));
    }
  }

  function handleDeleteRequest(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (doc) setConfirmDelete({ id, label: doc.filename });
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!(ACCEPTED_FILE_TYPES as readonly string[]).includes(file.type)) {
      setError("Unsupported file type. Use PDF, TXT, MD, or DOCX.");
      return;
    }
    handleUpload(file);
  }

  const docsByType = (mimeType: string) => documents.filter((d) => d.mime_type === mimeType);

  const foldersWithCounts = FOLDERS.map((f) => ({
    ...f,
    count: docsByType(f.mimeType).length,
  }));

  const folderDocs = openFolder
    ? documents.filter((d) => {
        const folder = FOLDERS.find((f) => f.type === openFolder);
        return folder && d.mime_type === folder.mimeType;
      })
    : [];

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 sm:gap-3 pl-10 md:pl-0">
          {openFolder && activeTab === "files" && (
            <button
              onClick={() => setOpenFolder(null)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back
            </button>
          )}
          <h1 className="text-sm font-medium text-foreground">
            {activeTab === "graph"
              ? "Knowledge Graph"
              : openFolder
              ? FOLDERS.find((f) => f.type === openFolder)?.label ?? "Folder"
              : "Artifacts"}
          </h1>
          {activeTab === "files" && (
            <span className="text-[10px] text-muted-foreground/40">
              {openFolder
                ? `${folderDocs.length} file${folderDocs.length !== 1 ? "s" : ""}`
                : `${documents.length} file${documents.length !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-md border border-border/40 bg-card/30 p-0.5">
          <button
            onClick={() => { setActiveTab("files"); setOpenFolder(null); }}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-all duration-150 ${
              activeTab === "files"
                ? "bg-hover text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            Files
          </button>
          <button
            onClick={() => setActiveTab("graph")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-all duration-150 ${
              activeTab === "graph"
                ? "bg-hover text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {/* Simple graph icon */}
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="5" cy="12" r="2" />
              <circle cx="19" cy="5" r="2" />
              <circle cx="19" cy="19" r="2" />
              <line x1="7" y1="12" x2="17" y2="6" strokeLinecap="round" />
              <line x1="7" y1="12" x2="17" y2="18" strokeLinecap="round" />
            </svg>
            Graph
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 sm:mx-6 mt-3 rounded-md bg-destructive/5 border border-destructive/10 px-3 py-2 text-[11px] text-destructive flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/40 hover:text-destructive">✕</button>
        </div>
      )}

      {activeTab === "files" && documents.some((d) => d.status === "pending" || d.status === "processing") && (
        <div className="mx-4 sm:mx-6 mt-3">
          <p className="text-[10px] text-muted-foreground/60 animate-pulse">Processing documents…</p>
        </div>
      )}

      {/* Graph tab */}
      {activeTab === "graph" && (
        <div className="flex-1 overflow-hidden p-4 sm:p-6">
          <div className="h-full rounded-xl overflow-hidden border border-border/30">
            <KnowledgeGraph />
          </div>
        </div>
      )}

      {/* Files tab */}
      {activeTab === "files" && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!openFolder ? (
            <div className="space-y-8">
              {/* Upload area */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`flex flex-col items-center gap-3 rounded-xl border border-dashed py-6 sm:py-8 px-4 sm:px-6 transition-colors ${
                  dragging
                    ? "border-foreground/40 bg-hover"
                    : "border-border/60 hover:border-border"
                }`}
              >
                <svg className="h-8 w-8 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-xs text-muted-foreground/50">Drop files here or click to upload</p>
                <div className="w-44">
                  <UploadButton onFileSelect={handleUpload} loading={uploading} />
                </div>
                <p className="text-[10px] text-muted-foreground/30">PDF · DOCX · PPTX · XLSX · TXT · MD · HTML · EPUB - up to 50MB</p>
              </div>

              {/* Folders - always shown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {foldersWithCounts.map((folder) => (
                  <button
                    key={folder.type}
                    onClick={() => setOpenFolder(folder.type)}
                    className="group flex flex-col items-center gap-2 rounded-xl p-4 hover:bg-hover transition-all duration-150"
                  >
                    <FolderIcon color={folder.color} />
                    <div className="text-center">
                      <p className="text-xs text-foreground/80 group-hover:text-foreground transition-colors">{folder.label}</p>
                      <p className="text-[10px] text-muted-foreground/40">
                        {folder.count === 0 ? "Empty" : `${folder.count} item${folder.count !== 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Quick graph teaser when there are ready documents */}
              {documents.some((d) => d.status === "ready") && (
                <button
                  onClick={() => setActiveTab("graph")}
                  className="w-full flex items-center gap-3 rounded-xl border border-border/30 bg-card/20 px-4 py-3 text-left hover:bg-hover/50 transition-all duration-150 group"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                    <svg className="h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="19" cy="5" r="2" />
                      <circle cx="19" cy="19" r="2" />
                      <line x1="7" y1="12" x2="17" y2="6" strokeLinecap="round" />
                      <line x1="7" y1="12" x2="17" y2="18" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/70 group-hover:text-foreground transition-colors">View Knowledge Graph</p>
                    <p className="text-[10px] text-muted-foreground/40">
                      Explore entities and connections across your documents
                    </p>
                  </div>
                  <svg className="ml-auto h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            /* File list */
            <div>
              {folderDocs.length === 0 ? (
                <p className="py-16 text-center text-xs text-muted-foreground/40">No files in this folder</p>
              ) : (
                <div className="rounded-xl border border-border/40 overflow-hidden">
                  {/* Column headers */}
                  <div className="hidden sm:grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 px-4 py-2 text-[10px] text-muted-foreground/40 uppercase tracking-wider border-b border-border/30 bg-card/30">
                    <span>Name</span>
                    <span>Size</span>
                    <span>Date</span>
                    <span>Status</span>
                    <span />
                  </div>

                  {folderDocs.map((doc) => {
                    const isExpanded = expandedId === doc.id;
                    return (
                      <div key={doc.id} className="border-b border-border/20 last:border-0">
                        {/* Desktop row */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") setExpandedId(isExpanded ? null : doc.id); }}
                          className={`group hidden sm:grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 items-center px-4 py-2.5 cursor-pointer transition-all duration-100 ${
                            isExpanded ? "bg-hover" : "hover:bg-hover/50"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <svg
                              className={`h-3 w-3 shrink-0 text-muted-foreground/30 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="text-xs text-foreground/80 truncate">{doc.filename}</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground/50">{formatSize(doc.size_bytes)}</span>
                          <span className="text-[11px] text-muted-foreground/50">{formatDate(doc.created_at)}</span>
                          <div className="flex items-center gap-1.5">
                            <StatusDot status={doc.status} />
                            <span className="text-[10px] text-muted-foreground/40 capitalize">{doc.status}</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRequest(doc.id); }}
                            className="opacity-0 group-hover:opacity-100 text-destructive/50 hover:text-destructive transition-opacity justify-self-end"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>

                        {/* Mobile card row */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") setExpandedId(isExpanded ? null : doc.id); }}
                          className={`sm:hidden flex items-start gap-3 px-3 py-3 cursor-pointer transition-all duration-100 ${
                            isExpanded ? "bg-hover" : "active:bg-hover/50"
                          }`}
                        >
                          <svg
                            className={`h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/30 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground/80 truncate">{doc.filename}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <StatusDot status={doc.status} />
                              <span className="text-[10px] text-muted-foreground/40 capitalize">{doc.status}</span>
                              <span className="text-[10px] text-muted-foreground/30">·</span>
                              <span className="text-[10px] text-muted-foreground/40">{formatSize(doc.size_bytes)}</span>
                              <span className="text-[10px] text-muted-foreground/30">·</span>
                              <span className="text-[10px] text-muted-foreground/40">{formatDate(doc.created_at)}</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRequest(doc.id); }}
                            className="shrink-0 text-destructive/40 hover:text-destructive p-1"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="px-3 sm:px-4 pb-3 pt-1 bg-hover/50 animate-fade-in">
                            <div className="ml-5 sm:ml-5">
                              {doc.summary ? (
                                <div>
                                  <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">Document Summary</p>
                                  <p className="text-[12px] text-foreground/70 leading-relaxed">{doc.summary}</p>
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted-foreground/30 italic">No summary available</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete document?"
        message={`"${confirmDelete?.label}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
