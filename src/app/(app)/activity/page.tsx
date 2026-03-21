"use client";

/**
 * /activity — Agent execution trace log.
 *
 * Shows every query the agent processed: what it retrieved, which entities
 * it used, timing per pipeline step, and the final output.
 *
 * Data comes from GET /api/agent/logs (paginated, newest-first).
 */

import { useEffect, useState, useCallback } from "react";
import { PROVIDER_LABELS } from "@/lib/models";

// ── Types (mirrors agent_logs table) ────────────────────────────────────────

interface AgentStep {
  step: "retrieval" | "graph_expansion" | "generation";
  duration_ms: number;
  meta?: Record<string, unknown>;
}

interface AgentLog {
  id: string;
  user_query: string;
  retrieved_chunks: Array<{
    id: string;
    documentId: string;
    filename: string;
    page: number | null;
    similarity: number;
  }>;
  entities_used: Array<{ name: string; type: string }>;
  steps: AgentStep[];
  final_output: string | null;
  model_used: string | null;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const STEP_COLORS: Record<string, string> = {
  retrieval: "bg-foreground/30",
  graph_expansion: "bg-foreground/20",
  generation: "bg-foreground/40",
};

const STEP_LABELS: Record<string, string> = {
  retrieval: "Retrieval",
  graph_expansion: "Graph",
  generation: "Generation",
};

// ── Step Bar ─────────────────────────────────────────────────────────────────

function StepBar({ steps }: { steps: AgentStep[] }) {
  const total = steps.reduce((s, st) => s + st.duration_ms, 0) || 1;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-32 rounded-full overflow-hidden gap-px">
        {steps.map((st) => (
          <div
            key={st.step}
            className={`h-full ${STEP_COLORS[st.step] ?? "bg-gray-500"}`}
            style={{ width: `${(st.duration_ms / total) * 100}%` }}
            title={`${STEP_LABELS[st.step] ?? st.step}: ${formatMs(st.duration_ms)}`}
          />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground/40">
        {formatMs(total)} total
      </span>
    </div>
  );
}

// ── Single Log Entry ─────────────────────────────────────────────────────────

function LogEntry({ log }: { log: AgentLog }) {
  const [expanded, setExpanded] = useState(false);

  const modelLabel = log.model_used
    ? log.model_used.includes("/")
      ? log.model_used.split("/")[1]
      : log.model_used
    : null;

  // Derive provider from model_used (e.g. "anthropic/claude-sonnet-4-5" → "anthropic")
  const provider = log.model_used?.includes("/")
    ? (log.model_used.split("/")[0] as keyof typeof PROVIDER_LABELS)
    : "openai";

  return (
    <div className="border-b border-border/20 last:border-0">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
          expanded ? "bg-hover" : "hover:bg-hover/40"
        }`}
      >
        {/* Chevron */}
        <svg
          className={`h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/30 transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        {/* Query */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground/80 truncate">{log.user_query}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {log.steps.length > 0 && <StepBar steps={log.steps} />}
            <span className="text-[10px] text-muted-foreground/40">
              {log.retrieved_chunks.length} chunk{log.retrieved_chunks.length !== 1 ? "s" : ""}
            </span>
            {log.entities_used.length > 0 && (
              <span className="text-[10px] text-muted-foreground/40">
                {log.entities_used.length} entit{log.entities_used.length !== 1 ? "ies" : "y"}
              </span>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
          <span className="text-[10px] text-muted-foreground/40">
            {formatRelative(log.created_at)}
          </span>
          {modelLabel && (
            <span className="text-[9px] text-muted-foreground/30">
              {PROVIDER_LABELS[provider] ?? provider} / {modelLabel}
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-hover/30 space-y-4 animate-fade-in">
          {/* Pipeline steps */}
          {log.steps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-2">
                Pipeline
              </p>
              <div className="flex flex-wrap gap-2">
                {log.steps.map((st) => (
                  <div
                    key={st.step}
                    className="rounded-md border border-border/30 bg-card/30 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${STEP_COLORS[st.step] ?? "bg-gray-500"}`}
                      />
                      <span className="text-[11px] text-foreground/70">
                        {STEP_LABELS[st.step] ?? st.step}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {formatMs(st.duration_ms)}
                      </span>
                    </div>
                    {st.meta && Object.keys(st.meta).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {Object.entries(st.meta).map(([k, v]) => (
                          <span key={k} className="text-[9px] text-muted-foreground/40">
                            {k.replace(/_/g, " ")}: <span className="text-muted-foreground/60">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entities */}
          {log.entities_used.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-2">
                Entities used
              </p>
              <div className="flex flex-wrap gap-1.5">
                {log.entities_used.map((e, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-md border border-border/30 bg-white/[0.04] px-2 py-0.5 text-[10px] text-foreground/50"
                  >
                    {e.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Retrieved chunks */}
          {log.retrieved_chunks.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-2">
                Retrieved chunks
              </p>
              <div className="rounded-lg border border-border/30 overflow-hidden">
                {log.retrieved_chunks.map((c, i) => (
                  <div
                    key={c.id ?? i}
                    className="flex items-center gap-3 px-3 py-2 border-b border-border/20 last:border-0"
                  >
                    <span className="text-[10px] text-muted-foreground/30 w-4 shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[11px] text-foreground/60 truncate">
                      {c.filename}
                      {c.page != null && (
                        <span className="ml-1.5 text-muted-foreground/40">
                          p.{c.page}
                        </span>
                      )}
                    </span>
                    {c.similarity > 0 && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="h-1 w-12 rounded-full bg-border/40 overflow-hidden">
                          <div
                            className="h-full bg-foreground/30 rounded-full"
                            style={{ width: `${c.similarity * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground/40">
                          {(c.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                    {c.similarity === 0 && (
                      <span className="text-[9px] text-muted-foreground/40 shrink-0">graph</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final output preview */}
          {log.final_output && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-2">
                Response preview
              </p>
              <p className="text-[11px] text-foreground/50 leading-relaxed line-clamp-4">
                {log.final_output}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function ActivityPage() {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (offset: number, append: boolean) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(
        `/api/agent/logs?limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (!res.ok) throw new Error("Failed to load activity");
      const data = await res.json();
      setLogs((prev) => (append ? [...prev, ...data.logs] : data.logs));
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(0, false);
  }, [fetchLogs]);

  const hasMore = logs.length < total;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 pl-10 md:pl-0">
          <h1 className="text-sm font-medium text-foreground">Activity</h1>
          {total > 0 && (
            <span className="text-[10px] text-muted-foreground/40">
              {total} trace{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3">
          {Object.entries(STEP_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={`h-1.5 w-1.5 rounded-full ${STEP_COLORS[key]}`} />
              <span className="text-[9px] text-muted-foreground/40">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground/40 animate-pulse">
              Loading traces…
            </p>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-destructive/60">{error}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
            <svg
              className="h-10 w-10 text-muted-foreground/20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-xs text-muted-foreground/40">
              No activity yet — ask a question to see traces here.
            </p>
          </div>
        ) : (
          <div className="rounded-none">
            {logs.map((log) => (
              <LogEntry key={log.id} log={log} />
            ))}

            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={() => fetchLogs(logs.length, true)}
                  disabled={loadingMore}
                  className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-40"
                >
                  {loadingMore ? "Loading…" : `Load more (${total - logs.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
