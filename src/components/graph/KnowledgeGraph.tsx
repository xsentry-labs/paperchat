"use client";

/**
 * KnowledgeGraph — Obsidian-style document relationship graph.
 *
 * Nodes  = Documents (sized by connection count)
 * Edges  = Two documents share entities (thickness = shared entity count)
 * Click  = Detail panel showing which documents link here and shared topics
 */

import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  summary?: string | null;
  degree: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  sharedEntities: string[];
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const NODE_COLOR = "#e2e8f0";
const EDGE_COLOR = "rgba(148,163,184,0.18)";
const EDGE_HIGHLIGHT = "rgba(148,163,184,0.55)";
const LABEL_COLOR = "rgba(226,232,240,0.85)";
const LABEL_DIM = "rgba(148,163,184,0.2)";

const REPULSION = 6000;
const ATTRACTION = 0.04;
const DAMPING = 0.80;
const CENTER_PULL = 0.008;

// ── Node radius: 7–18px based on degree ───────────────────────────────────

function nodeRadius(degree: number): number {
  return Math.max(7, Math.min(18, 7 + Math.sqrt(degree) * 2.8));
}

// ── Detail Panel ──────────────────────────────────────────────────────────

function DetailPanel({
  node,
  edges,
  allNodes,
  onClose,
}: {
  node: GraphNode;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
}) {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const links = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .sort((a, b) => b.weight - a.weight)
    .map((e) => ({
      peer: nodeById.get(e.source === node.id ? e.target : e.source)!,
      weight: e.weight,
      shared: e.sharedEntities,
    }))
    .filter((l) => l.peer);

  return (
    <div className="absolute top-3 right-3 w-60 rounded-xl border border-white/10 bg-[#08080d]/95 backdrop-blur-sm shadow-2xl p-3 z-10">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 pr-2">
          <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Document</p>
          <p className="text-xs text-slate-200 leading-snug break-words">{node.label}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-slate-700 hover:text-slate-400 transition-colors mt-0.5"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {node.summary && (
        <div className="mb-3">
          <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-1">Summary</p>
          <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-4">{node.summary}</p>
        </div>
      )}

      {links.length === 0 ? (
        <p className="text-[10px] text-slate-600">No links yet — upload more documents.</p>
      ) : (
        <>
          <p className="text-[9px] uppercase tracking-widest text-slate-600 mb-2">
            Linked to {links.length} document{links.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-0.5">
            {links.map(({ peer, weight, shared }) => (
              <div key={peer.id} className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-300 leading-snug truncate pr-2">
                    {peer.label}
                  </span>
                  <span className="shrink-0 text-[9px] text-slate-600">
                    {weight} shared
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {shared.slice(0, 5).map((s) => (
                    <span
                      key={s}
                      className="text-[8px] rounded px-1 py-0.5 bg-slate-800/60 text-slate-500"
                    >
                      {s}
                    </span>
                  ))}
                  {shared.length > 5 && (
                    <span className="text-[8px] text-slate-700">+{shared.length - 5}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<GraphData>({ nodes: [], edges: [] });
  const nodesRef = useRef<GraphNode[]>([]);
  const animRef = useRef<number>(0);

  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, tx: 0, ty: 0 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState("");
  const [docCount, setDocCount] = useState(0);

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/graph")
      .then((r) => r.json())
      .then((data: GraphData) => {
        if (cancelled) return;
        dataRef.current = data;
        setDocCount(data.nodes.length);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load graph");
      });
    return () => { cancelled = true; };
  }, []);

  // ── Init node positions ──────────────────────────────────────────────────
  const initNodes = useCallback((canvas: HTMLCanvasElement) => {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const count = dataRef.current.nodes.length || 1;
    const r = Math.min(cx, cy) * 0.4;
    nodesRef.current = dataRef.current.nodes.map((n, i) => ({
      ...n,
      x: cx + r * Math.cos((2 * Math.PI * i) / count),
      y: cy + r * Math.sin((2 * Math.PI * i) / count),
      vx: 0,
      vy: 0,
    }));
  }, []);

  // ── Physics + draw tick ──────────────────────────────────────────────────
  const tick = useCallback((canvas: HTMLCanvasElement) => {
    const nodes = nodesRef.current;
    if (nodes.length === 0) return;

    const q = search.trim().toLowerCase();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const edges = dataRef.current.edges;

    // Build adjacency for highlight
    const adjMap = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!adjMap.has(e.source)) adjMap.set(e.source, new Set());
      if (!adjMap.has(e.target)) adjMap.set(e.target, new Set());
      adjMap.get(e.source)!.add(e.target);
      adjMap.get(e.target)!.add(e.source);
    }

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const dist2 = dx * dx + dy * dy + 1;
        const f = REPULSION / dist2;
        const d = Math.sqrt(dist2);
        a.vx = (a.vx ?? 0) - (dx / d) * f;
        a.vy = (a.vy ?? 0) - (dy / d) * f;
        b.vx = (b.vx ?? 0) + (dx / d) * f;
        b.vy = (b.vy ?? 0) + (dy / d) * f;
      }
    }

    // Attraction along edges (stronger for higher weight)
    for (const e of edges) {
      const a = nodeById.get(e.source), b = nodeById.get(e.target);
      if (!a || !b) continue;
      const dx = (b.x ?? 0) - (a.x ?? 0);
      const dy = (b.y ?? 0) - (a.y ?? 0);
      const strength = ATTRACTION * Math.log1p(e.weight);
      a.vx = (a.vx ?? 0) + dx * strength;
      a.vy = (a.vy ?? 0) + dy * strength;
      b.vx = (b.vx ?? 0) - dx * strength;
      b.vy = (b.vy ?? 0) - dy * strength;
    }

    // Damping + center pull
    for (const n of nodes) {
      n.vx = (n.vx ?? 0) * DAMPING + (cx - (n.x ?? cx)) * CENTER_PULL;
      n.vy = (n.vy ?? 0) * DAMPING + (cy - (n.y ?? cy)) * CENTER_PULL;
      n.x = (n.x ?? cx) + (n.vx ?? 0);
      n.y = (n.y ?? cy) + (n.vy ?? 0);
    }

    // ── Draw ──────────────────────────────────────────────────────────────
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { x: tx, y: ty, scale } = transformRef.current;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    const hovered = hoveredRef.current;
    const selected = selectedRef.current;
    const connectedToSelected = selected ? adjMap.get(selected) ?? new Set() : null;

    // Edges
    for (const e of edges) {
      const a = nodeById.get(e.source), b = nodeById.get(e.target);
      if (!a || !b) continue;
      const isHighlighted = selected && (e.source === selected || e.target === selected);
      ctx.beginPath();
      ctx.moveTo(a.x ?? 0, a.y ?? 0);
      ctx.lineTo(b.x ?? 0, b.y ?? 0);
      ctx.strokeStyle = isHighlighted ? EDGE_HIGHLIGHT : EDGE_COLOR;
      ctx.lineWidth = isHighlighted
        ? Math.max(1, Math.min(3, Math.log1p(e.weight)))
        : Math.max(0.5, Math.min(2, Math.log1p(e.weight) * 0.6));
      ctx.stroke();
    }

    // Nodes
    for (const n of nodes) {
      const r = nodeRadius(n.degree);
      const isHovered = n.id === hovered;
      const isSelected = n.id === selected;
      const isDimBySelect = selected && n.id !== selected && !connectedToSelected?.has(n.id);
      const isDimBySearch = q && !n.label.toLowerCase().includes(q);
      const isDim = isDimBySelect || isDimBySearch;

      // Glow
      ctx.shadowBlur = isSelected || isHovered ? 16 : n.degree > 0 ? 4 : 0;
      ctx.shadowColor = NODE_COLOR;

      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, isHovered || isSelected ? r + 2 : r, 0, Math.PI * 2);
      ctx.fillStyle = isDim
        ? "rgba(226,232,240,0.08)"
        : isSelected
        ? "#fff"
        : isHovered
        ? "rgba(226,232,240,0.95)"
        : "rgba(226,232,240,0.75)";
      ctx.fill();

      // Outer ring for connected nodes
      if (n.degree > 0 && !isDim) {
        ctx.strokeStyle = isSelected || isHovered
          ? "rgba(226,232,240,0.6)"
          : "rgba(226,232,240,0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      // Label
      const showLabel = isHovered || isSelected || !q || n.label.toLowerCase().includes(q);
      if (showLabel) {
        // Strip extension for cleaner display
        const name = n.label.replace(/\.[^.]+$/, "");
        const label = name.length > 26 ? name.slice(0, 24) + "…" : name;
        ctx.font = isSelected ? "bold 11px sans-serif" : "10px sans-serif";
        ctx.fillStyle = isDim ? LABEL_DIM : LABEL_COLOR;
        ctx.textAlign = "center";
        ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + r + 13);
      }
    }

    ctx.restore();
  }, [search]);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || error || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        transformRef.current = { x: 0, y: 0, scale: 1 };
      }
      initNodes(canvas);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      tick(canvas);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [loading, error, tick, initNodes]);

  // ── Hit test ──────────────────────────────────────────────────────────────
  const getNodeAt = useCallback((mx: number, my: number): GraphNode | null => {
    const { x: tx, y: ty, scale } = transformRef.current;
    const cx = (mx - tx) / scale;
    const cy = (my - ty) / scale;
    for (const n of nodesRef.current) {
      const r = nodeRadius(n.degree) + 6;
      const dx = (n.x ?? 0) - cx;
      const dy = (n.y ?? 0) - cy;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }, []);

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isPanningRef.current) {
      transformRef.current.x = panStartRef.current.tx + (mx - panStartRef.current.mx);
      transformRef.current.y = panStartRef.current.ty + (my - panStartRef.current.my);
      return;
    }

    const node = getNodeAt(mx, my);
    hoveredRef.current = node?.id ?? null;
    canvasRef.current!.style.cursor = node ? "pointer" : "grab";
  }, [getNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (!getNodeAt(mx, my)) {
      isPanningRef.current = true;
      panStartRef.current = { mx, my, tx: transformRef.current.x, ty: transformRef.current.y };
      canvasRef.current!.style.cursor = "grabbing";
    }
  }, [getNodeAt]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isPanningRef.current) {
      isPanningRef.current = false;
      canvasRef.current!.style.cursor = "grab";
      return;
    }

    const node = getNodeAt(mx, my);
    const next = node?.id === selectedRef.current ? null : node?.id ?? null;
    selectedRef.current = next;
    setSelectedNode(next ? (node ?? null) : null);
  }, [getNodeAt]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    const { x: tx, y: ty, scale } = transformRef.current;
    const newScale = Math.max(0.15, Math.min(6, scale * factor));
    transformRef.current = {
      x: mx - (mx - tx) * (newScale / scale),
      y: my - (my - ty) * (newScale / scale),
      scale: newScale,
    };
  }, []);

  // ── States ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground/40 animate-pulse">Loading graph…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-destructive/60">{error}</p>
      </div>
    );
  }
  if (docCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <svg className="h-12 w-12 text-muted-foreground/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
          <circle cx="5" cy="12" r="2.5" />
          <circle cx="19" cy="5" r="2.5" />
          <circle cx="19" cy="19" r="2.5" />
          <line x1="7.5" y1="11" x2="16.5" y2="6.5" />
          <line x1="7.5" y1="13" x2="16.5" y2="17.5" />
        </svg>
        <p className="text-xs text-muted-foreground/35 text-center max-w-[180px]">
          Upload documents to see how they connect
        </p>
      </div>
    );
  }
  if (docCount === 1) {
    return (
      <div className="relative h-full w-full bg-[#0a0a0f]" style={{ borderRadius: "inherit" }}>
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ cursor: "grab" }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { hoveredRef.current = null; isPanningRef.current = false; }}
          onWheel={handleWheel}
        />
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-[10px] text-slate-700 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
            Upload more documents to see connections
          </p>
        </div>
        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            edges={dataRef.current.edges}
            allNodes={nodesRef.current}
            onClose={() => { selectedRef.current = null; setSelectedNode(null); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#0a0a0f]" style={{ borderRadius: "inherit" }}>
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ cursor: "grab" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { hoveredRef.current = null; isPanningRef.current = false; }}
        onWheel={handleWheel}
      />

      {/* Search */}
      <div className="absolute top-3 left-3">
        <input
          type="text"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-36 rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-white/20 backdrop-blur-sm"
        />
      </div>

      {/* Doc count */}
      <div className="absolute top-3 right-3">
        {!selectedNode && (
          <span className="text-[9px] text-slate-700">{docCount} documents</span>
        )}
      </div>

      {/* Hints */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-0.5 pointer-events-none">
        <p className="text-[9px] text-slate-800">scroll to zoom · drag to pan</p>
        <p className="text-[9px] text-slate-800">click document for links</p>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          edges={dataRef.current.edges}
          allNodes={nodesRef.current}
          onClose={() => { selectedRef.current = null; setSelectedNode(null); }}
        />
      )}
    </div>
  );
}
