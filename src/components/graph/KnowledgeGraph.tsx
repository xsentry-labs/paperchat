"use client";

/**
 * KnowledgeGraph — minimal Obsidian-style force-directed graph.
 *
 * Pure canvas implementation using requestAnimationFrame.
 * No external graph library required.
 *
 * Node types and colors:
 *   document     → white/gray  (larger)
 *   person       → #60a5fa blue
 *   place        → #34d399 green
 *   organization → #fb923c orange
 *   concept      → #a78bfa purple
 *
 * Edges are drawn as thin semi-transparent lines.
 * Hovering a node shows its label; clicking highlights connections.
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface GraphNode {
  id: string;
  type: "document" | "entity";
  label: string;
  entityType?: string;
  // Physics state (mutable, attached at runtime)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Colors ──────────────────────────────────────────────────────────────────

const NODE_COLOR: Record<string, string> = {
  document: "#e2e8f0",
  person: "#60a5fa",
  place: "#34d399",
  organization: "#fb923c",
  concept: "#a78bfa",
};

const NODE_RADIUS: Record<string, number> = {
  document: 10,
  entity: 5,
};

function nodeColor(node: GraphNode): string {
  if (node.type === "document") return NODE_COLOR.document;
  return NODE_COLOR[node.entityType ?? "concept"] ?? NODE_COLOR.concept;
}

function nodeRadius(node: GraphNode): number {
  return node.type === "document" ? NODE_RADIUS.document : NODE_RADIUS.entity;
}

// ── Physics constants ────────────────────────────────────────────────────────

const REPULSION = 3500;
const ATTRACTION = 0.04;
const DAMPING = 0.82;
const CENTER_PULL = 0.012;

// ── Component ───────────────────────────────────────────────────────────────

export function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<GraphData>({ nodes: [], edges: [] });
  const nodesRef = useRef<GraphNode[]>([]); // live physics nodes
  const animRef = useRef<number>(0);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });

  // ── Fetch graph data ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/graph")
      .then((r) => r.json())
      .then((data: GraphData) => {
        if (cancelled) return;
        dataRef.current = data;
        setStats({ nodes: data.nodes.length, edges: data.edges.length });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load graph");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Initialize physics nodes ───────────────────────────────────────────────
  const initNodes = useCallback((canvas: HTMLCanvasElement) => {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.min(cx, cy) * 0.5;
    const count = dataRef.current.nodes.length;

    nodesRef.current = dataRef.current.nodes.map((n, i) => ({
      ...n,
      x: cx + r * Math.cos((2 * Math.PI * i) / count),
      y: cy + r * Math.sin((2 * Math.PI * i) / count),
      vx: 0,
      vy: 0,
    }));
  }, []);

  // ── Physics tick ──────────────────────────────────────────────────────────
  const tick = useCallback(
    (canvas: HTMLCanvasElement) => {
      const nodes = nodesRef.current;
      if (nodes.length === 0) return;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const edgeMap = new Map<string, Set<string>>();

      for (const e of dataRef.current.edges) {
        if (!edgeMap.has(e.source)) edgeMap.set(e.source, new Set());
        if (!edgeMap.has(e.target)) edgeMap.set(e.target, new Set());
        edgeMap.get(e.source)!.add(e.target);
        edgeMap.get(e.target)!.add(e.source);
      }

      // Repulsion between all node pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = (b.x ?? 0) - (a.x ?? 0);
          const dy = (b.y ?? 0) - (a.y ?? 0);
          const dist2 = dx * dx + dy * dy + 1;
          const force = REPULSION / dist2;
          const fx = (dx / Math.sqrt(dist2)) * force;
          const fy = (dy / Math.sqrt(dist2)) * force;
          a.vx = (a.vx ?? 0) - fx;
          a.vy = (a.vy ?? 0) - fy;
          b.vx = (b.vx ?? 0) + fx;
          b.vy = (b.vy ?? 0) + fy;
        }
      }

      // Attraction along edges
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      for (const e of dataRef.current.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        a.vx = (a.vx ?? 0) + dx * ATTRACTION;
        a.vy = (a.vy ?? 0) + dy * ATTRACTION;
        b.vx = (b.vx ?? 0) - dx * ATTRACTION;
        b.vy = (b.vy ?? 0) - dy * ATTRACTION;
      }

      // Center gravity + damping + position update
      for (const n of nodes) {
        n.vx = (n.vx ?? 0) * DAMPING + (cx - (n.x ?? cx)) * CENTER_PULL;
        n.vy = (n.vy ?? 0) * DAMPING + (cy - (n.y ?? cy)) * CENTER_PULL;
        n.x = (n.x ?? cx) + (n.vx ?? 0);
        n.y = (n.y ?? cy) + (n.vy ?? 0);
      }

      // ── Draw ────────────────────────────────────────────────────────────
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const hovered = hoveredRef.current;
      const selected = selectedRef.current;

      // Determine connected nodes for highlight
      const connectedToSelected = selected ? edgeMap.get(selected) ?? new Set() : null;

      // Draw edges
      for (const e of dataRef.current.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;

        const isHighlighted =
          selected &&
          (e.source === selected || e.target === selected);

        ctx.beginPath();
        ctx.moveTo(a.x ?? 0, a.y ?? 0);
        ctx.lineTo(b.x ?? 0, b.y ?? 0);
        ctx.strokeStyle = isHighlighted
          ? "rgba(148,163,184,0.7)"
          : "rgba(100,116,139,0.2)";
        ctx.lineWidth = isHighlighted ? 1.2 : 0.7;
        ctx.stroke();
      }

      // Draw nodes
      for (const n of nodes) {
        const r = nodeRadius(n);
        const color = nodeColor(n);
        const isHovered = n.id === hovered;
        const isSelected = n.id === selected;
        const isDim =
          selected &&
          n.id !== selected &&
          !connectedToSelected?.has(n.id);

        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, isHovered || isSelected ? r + 2 : r, 0, Math.PI * 2);

        // Glow for selected/hovered
        if (isSelected || isHovered) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 12;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = isDim
          ? color + "40"
          : isSelected
          ? color
          : color + (isHovered ? "ff" : "cc");
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border on document nodes
        if (n.type === "document") {
          ctx.strokeStyle = isDim ? "rgba(226,232,240,0.2)" : "rgba(226,232,240,0.6)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Label for documents always; for entities only on hover/select
        const showLabel =
          n.type === "document" || isHovered || isSelected;
        if (showLabel) {
          const label =
            n.label.length > 24 ? n.label.slice(0, 22) + "…" : n.label;
          ctx.font = n.type === "document" ? "bold 10px sans-serif" : "9px sans-serif";
          ctx.fillStyle = isDim ? "rgba(148,163,184,0.3)" : "rgba(226,232,240,0.85)";
          ctx.textAlign = "center";
          ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + r + 12);
        }
      }
    },
    []
  );

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || error || !canvasRef.current) return;
    const canvas = canvasRef.current;

    // Size canvas to container
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
      initNodes(canvas);
    };
    resize();
    window.addEventListener("resize", resize);

    let frameCount = 0;
    const loop = () => {
      frameCount++;
      tick(canvas);
      // Slow down after 300 frames to save CPU (graph is stable)
      if (frameCount < 300 || frameCount % 3 === 0) {
        animRef.current = requestAnimationFrame(loop);
      } else {
        animRef.current = requestAnimationFrame(loop);
      }
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [loading, error, tick, initNodes]);

  // ── Mouse interaction ──────────────────────────────────────────────────────
  const getNodeAt = useCallback((x: number, y: number): GraphNode | null => {
    for (const n of nodesRef.current) {
      const r = nodeRadius(n) + 4; // hit area slightly larger
      const dx = (n.x ?? 0) - x;
      const dy = (n.y ?? 0) - y;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = getNodeAt(x, y);
      hoveredRef.current = node?.id ?? null;
      if (node) {
        setTooltip({ label: node.label, x: e.clientX, y: e.clientY });
      } else {
        setTooltip(null);
      }
    },
    [getNodeAt]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = getNodeAt(x, y);
      selectedRef.current = node?.id === selectedRef.current ? null : (node?.id ?? null);
    },
    [getNodeAt]
  );

  // ── Legend ─────────────────────────────────────────────────────────────────
  const legendItems = [
    { color: NODE_COLOR.document, label: "Document" },
    { color: NODE_COLOR.person, label: "Person" },
    { color: NODE_COLOR.place, label: "Place" },
    { color: NODE_COLOR.organization, label: "Organization" },
    { color: NODE_COLOR.concept, label: "Concept" },
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground/50 animate-pulse">Loading graph…</p>
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

  if (dataRef.current.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <svg className="h-10 w-10 text-muted-foreground/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="18" cy="18" r="2" />
          <line x1="8" y1="12" x2="16" y2="7" />
          <line x1="8" y1="12" x2="16" y2="17" />
        </svg>
        <p className="text-xs text-muted-foreground/40">
          Upload documents to see the knowledge graph
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#0a0a0f]" style={{ borderRadius: "inherit" }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={() => {
          hoveredRef.current = null;
          setTooltip(null);
        }}
      />

      {/* Stats */}
      <div className="absolute top-3 left-3 flex gap-3">
        <span className="text-[10px] text-slate-500">{stats.nodes} nodes</span>
        <span className="text-[10px] text-slate-500">{stats.edges} edges</span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[9px] text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Hint */}
      <p className="absolute bottom-3 right-3 text-[9px] text-slate-600">
        Click to highlight connections
      </p>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 max-w-48 rounded bg-card border border-border px-2 py-1 text-[10px] text-foreground shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
