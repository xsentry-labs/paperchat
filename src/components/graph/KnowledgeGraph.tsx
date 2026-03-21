"use client";

/**
 * KnowledgeGraph — minimal Obsidian-style force-directed graph.
 *
 * Features:
 *   - Canvas force simulation (no external library)
 *   - Zoom (mousewheel) + Pan (drag background)
 *   - Entity type filters (toggle which node types are shown)
 *   - Node search (highlights matching nodes, dims others)
 *   - Click a node → detail panel (which docs mention it / entity count)
 */

import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  type: "document" | "entity";
  label: string;
  entityType?: string;
  weight?: number; // chunk frequency — drives node radius
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

// ── Colors & sizes ──────────────────────────────────────────────────────────

export const ENTITY_TYPE_COLORS: Record<string, string> = {
  document: "#e2e8f0",
  person: "#60a5fa",
  place: "#34d399",
  organization: "#fb923c",
  concept: "#a78bfa",
};

const ENTITY_TYPES = ["person", "place", "organization", "concept"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const TYPE_LABELS: Record<string, string> = {
  person: "People",
  place: "Places",
  organization: "Orgs",
  concept: "Concepts",
};

function nodeColor(node: GraphNode): string {
  if (node.type === "document") return ENTITY_TYPE_COLORS.document;
  return ENTITY_TYPE_COLORS[node.entityType ?? "concept"] ?? ENTITY_TYPE_COLORS.concept;
}

function nodeRadius(node: GraphNode): number {
  if (node.type === "document") return 10;
  // Entity radius: 3–8 px based on how many chunks reference it
  const w = node.weight ?? 1;
  return Math.max(3, Math.min(8, 3 + Math.sqrt(w) * 1.2));
}

// ── Physics ─────────────────────────────────────────────────────────────────

const REPULSION = 4000;
const ATTRACTION = 0.035;
const DAMPING = 0.82;
const CENTER_PULL = 0.01;

// ── Detail Panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  node: GraphNode;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
}

function DetailPanel({ node, edges, allNodes, onClose }: DetailPanelProps) {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));

  // For a document: list connected entities
  // For an entity: list connected documents
  const connected =
    node.type === "document"
      ? edges
          .filter((e) => e.source === node.id || e.target === node.id)
          .map((e) => nodeById.get(e.source === node.id ? e.target : e.source))
          .filter(Boolean) as GraphNode[]
      : edges
          .filter((e) => e.source === node.id || e.target === node.id)
          .map((e) => nodeById.get(e.source === node.id ? e.target : e.source))
          .filter(Boolean) as GraphNode[];

  const entityGroups =
    node.type === "document"
      ? ENTITY_TYPES.map((t) => ({
          type: t,
          items: connected.filter((n) => n.entityType === t),
        })).filter((g) => g.items.length > 0)
      : [];

  return (
    <div className="absolute top-3 right-3 w-56 rounded-xl border border-border/40 bg-[#0a0a0f]/95 backdrop-blur-sm shadow-xl p-3 animate-fade-in z-10">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{
                backgroundColor:
                  node.type === "document"
                    ? ENTITY_TYPE_COLORS.document
                    : ENTITY_TYPE_COLORS[node.entityType ?? "concept"],
              }}
            />
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
              {node.type === "document" ? "Document" : node.entityType}
            </span>
          </div>
          <p className="text-xs text-foreground/80 break-words leading-snug">
            {node.label}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 ml-2 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="border-t border-border/20 pt-2">
        {node.type === "document" ? (
          <>
            <p className="text-[10px] text-muted-foreground/40 mb-2">
              {connected.length} entit{connected.length !== 1 ? "ies" : "y"} extracted
            </p>
            {entityGroups.map(({ type, items }) => (
              <div key={type} className="mb-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/30 mb-1">
                  {TYPE_LABELS[type]}
                </p>
                <div className="flex flex-wrap gap-1">
                  {items.slice(0, 8).map((n) => (
                    <span
                      key={n.id}
                      className="text-[9px] rounded px-1.5 py-0.5"
                      style={{
                        backgroundColor:
                          ENTITY_TYPE_COLORS[type] + "18",
                        color: ENTITY_TYPE_COLORS[type] + "cc",
                      }}
                    >
                      {n.label}
                    </span>
                  ))}
                  {items.length > 8 && (
                    <span className="text-[9px] text-muted-foreground/30">
                      +{items.length - 8}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground/40 mb-2">
              Mentioned in {connected.length} document{connected.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-1">
              {connected.map((n) => (
                <div key={n.id} className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-400/40 shrink-0" />
                  <span className="text-[10px] text-foreground/50 truncate">
                    {n.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<GraphData>({ nodes: [], edges: [] });
  const nodesRef = useRef<GraphNode[]>([]);
  const animRef = useRef<number>(0);

  // Interaction state — stored in refs to avoid triggering re-renders per frame
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  // Camera transform
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mx: 0, my: 0, tx: 0, ty: 0 });

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<EntityType>>(
    new Set(ENTITY_TYPES)
  );
  const [search, setSearch] = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────────
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
    return () => { cancelled = true; };
  }, []);

  // ── Visible nodes (after filters + search) ────────────────────────────────
  const getVisibleNodeIds = useCallback((): Set<string> => {
    const q = search.trim().toLowerCase();
    const ids = new Set<string>();
    for (const n of dataRef.current.nodes) {
      if (n.type === "document") {
        ids.add(n.id); // documents always shown
      } else if (activeFilters.has(n.entityType as EntityType)) {
        if (!q || n.label.includes(q)) ids.add(n.id);
      }
    }
    return ids;
  }, [activeFilters, search]);

  // ── Physics nodes init ─────────────────────────────────────────────────────
  const initNodes = useCallback((canvas: HTMLCanvasElement) => {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const count = dataRef.current.nodes.length || 1;
    const r = Math.min(cx, cy) * 0.45;
    nodesRef.current = dataRef.current.nodes.map((n, i) => ({
      ...n,
      x: cx + r * Math.cos((2 * Math.PI * i) / count),
      y: cy + r * Math.sin((2 * Math.PI * i) / count),
      vx: 0,
      vy: 0,
    }));
  }, []);

  // ── Tick (physics + draw) ──────────────────────────────────────────────────
  const tick = useCallback(
    (canvas: HTMLCanvasElement) => {
      const nodes = nodesRef.current;
      if (nodes.length === 0) return;

      const visibleIds = getVisibleNodeIds();
      const visibleNodes = nodes.filter((n) => visibleIds.has(n.id));
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Build fast lookup
      const nodeById = new Map(nodes.map((n) => [n.id, n]));

      // Build adjacency for highlight
      const adjMap = new Map<string, Set<string>>();
      for (const e of dataRef.current.edges) {
        if (!adjMap.has(e.source)) adjMap.set(e.source, new Set());
        if (!adjMap.has(e.target)) adjMap.set(e.target, new Set());
        adjMap.get(e.source)!.add(e.target);
        adjMap.get(e.target)!.add(e.source);
      }

      // Physics on visible nodes only
      for (let i = 0; i < visibleNodes.length; i++) {
        for (let j = i + 1; j < visibleNodes.length; j++) {
          const a = visibleNodes[i];
          const b = visibleNodes[j];
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

      for (const e of dataRef.current.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b || !visibleIds.has(a.id) || !visibleIds.has(b.id)) continue;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        a.vx = (a.vx ?? 0) + dx * ATTRACTION;
        a.vy = (a.vy ?? 0) + dy * ATTRACTION;
        b.vx = (b.vx ?? 0) - dx * ATTRACTION;
        b.vy = (b.vy ?? 0) - dy * ATTRACTION;
      }

      for (const n of visibleNodes) {
        n.vx = (n.vx ?? 0) * DAMPING + (cx - (n.x ?? cx)) * CENTER_PULL;
        n.vy = (n.vy ?? 0) * DAMPING + (cy - (n.y ?? cy)) * CENTER_PULL;
        n.x = (n.x ?? cx) + (n.vx ?? 0);
        n.y = (n.y ?? cy) + (n.vy ?? 0);
      }

      // ── Draw ───────────────────────────────────────────────────────────────
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { x: tx, y: ty, scale } = transformRef.current;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);

      const hovered = hoveredRef.current;
      const selected = selectedRef.current;
      const q = search.trim().toLowerCase();
      const connectedToSelected = selected ? adjMap.get(selected) ?? new Set() : null;

      // Draw edges
      for (const e of dataRef.current.edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b || !visibleIds.has(a.id) || !visibleIds.has(b.id)) continue;

        const isHighlighted = selected && (e.source === selected || e.target === selected);
        ctx.beginPath();
        ctx.moveTo(a.x ?? 0, a.y ?? 0);
        ctx.lineTo(b.x ?? 0, b.y ?? 0);
        ctx.strokeStyle = isHighlighted
          ? "rgba(148,163,184,0.6)"
          : "rgba(100,116,139,0.18)";
        ctx.lineWidth = isHighlighted ? 1.2 : 0.6;
        ctx.stroke();
      }

      // Draw nodes
      for (const n of visibleNodes) {
        const r = nodeRadius(n);
        const color = nodeColor(n);
        const isHovered = n.id === hovered;
        const isSelected = n.id === selected;
        const isDimBySelect = selected && n.id !== selected && !connectedToSelected?.has(n.id);
        const isDimBySearch = q && !n.label.includes(q) && n.type !== "document";

        const isDim = isDimBySelect || isDimBySearch;

        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, isHovered || isSelected ? r + 2 : r, 0, Math.PI * 2);

        ctx.shadowBlur = isSelected || isHovered ? 12 : 0;
        ctx.shadowColor = color;
        ctx.fillStyle = isDim ? color + "28" : isSelected ? color : color + (isHovered ? "ff" : "bb");
        ctx.fill();
        ctx.shadowBlur = 0;

        if (n.type === "document") {
          ctx.strokeStyle = isDim ? "rgba(226,232,240,0.15)" : "rgba(226,232,240,0.5)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Labels: always show for documents; show for high-weight entities or on hover/select/search
        const isProminent = (n.weight ?? 1) >= 4;
        const showLabel =
          n.type === "document" ||
          isHovered ||
          isSelected ||
          (q && n.label.includes(q)) ||
          isProminent;
        if (showLabel) {
          const label = n.label.length > 24 ? n.label.slice(0, 22) + "…" : n.label;
          ctx.font = n.type === "document" ? "bold 11px sans-serif" : "9px sans-serif";
          ctx.fillStyle = isDim
            ? "rgba(148,163,184,0.2)"
            : n.type === "document"
            ? "rgba(226,232,240,0.9)"
            : "rgba(200,200,220,0.65)";
          ctx.textAlign = "center";
          ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + r + 12);
        }
      }

      ctx.restore();
    },
    [getVisibleNodeIds, search]
  );

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || error || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        // Re-center camera when resized
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

  // ── Hit test (accounts for camera transform) ──────────────────────────────
  const getNodeAt = useCallback((mx: number, my: number): GraphNode | null => {
    const { x: tx, y: ty, scale } = transformRef.current;
    const cx = (mx - tx) / scale;
    const cy = (my - ty) / scale;
    const visibleIds = getVisibleNodeIds();
    for (const n of nodesRef.current) {
      if (!visibleIds.has(n.id)) continue;
      const r = nodeRadius(n) + 5;
      const dx = (n.x ?? 0) - cx;
      const dy = (n.y ?? 0) - cy;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }, [getVisibleNodeIds]);

  // ── Mouse event handlers ──────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    },
    [getNodeAt]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = getNodeAt(mx, my);

      if (!node) {
        // Start panning
        isPanningRef.current = true;
        panStartRef.current = {
          mx,
          my,
          tx: transformRef.current.x,
          ty: transformRef.current.y,
        };
        canvasRef.current!.style.cursor = "grabbing";
      }
    },
    [getNodeAt]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (isPanningRef.current) {
        isPanningRef.current = false;
        canvasRef.current!.style.cursor = "grab";
        return;
      }

      // Click: select node
      const node = getNodeAt(mx, my);
      const newSelected = node?.id === selectedRef.current ? null : node?.id ?? null;
      selectedRef.current = newSelected;
      setSelectedNode(newSelected ? (node ?? null) : null);
    },
    [getNodeAt]
  );

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const { x: tx, y: ty, scale } = transformRef.current;
    const newScale = Math.max(0.2, Math.min(5, scale * factor));

    // Zoom towards cursor
    transformRef.current = {
      x: mx - (mx - tx) * (newScale / scale),
      y: my - (my - ty) * (newScale / scale),
      scale: newScale,
    };
  }, []);

  const toggleFilter = useCallback((type: EntityType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type); // keep at least one filter active
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // ── Empty / loading states ────────────────────────────────────────────────
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
          <circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" />
          <line x1="8" y1="12" x2="16" y2="7" /><line x1="8" y1="12" x2="16" y2="17" />
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
        className="h-full w-full"
        style={{ cursor: "grab" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          hoveredRef.current = null;
          isPanningRef.current = false;
        }}
        onWheel={handleWheel}
      />

      {/* Top-left: search */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-32 rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-white/25 backdrop-blur-sm"
        />
        <span className="text-[9px] text-slate-700">
          {stats.nodes} nodes · {stats.edges} links
        </span>
      </div>

      {/* Bottom-left: entity type filters */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        <p className="text-[8px] uppercase tracking-widest text-slate-600 mb-0.5">Filter</p>
        {ENTITY_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleFilter(type)}
            className={`flex items-center gap-1.5 transition-opacity ${
              activeFilters.has(type) ? "opacity-100" : "opacity-35"
            }`}
          >
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{
                backgroundColor: activeFilters.has(type)
                  ? ENTITY_TYPE_COLORS[type]
                  : "#4b5563",
              }}
            />
            <span className="text-[9px] text-slate-500">{TYPE_LABELS[type]}</span>
          </button>
        ))}
        {/* Document marker */}
        <div className="flex items-center gap-1.5 mt-0.5 border-t border-white/5 pt-1.5">
          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ENTITY_TYPE_COLORS.document }} />
          <span className="text-[9px] text-slate-500">Document</span>
        </div>
      </div>

      {/* Bottom-right: controls hint */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1">
        <p className="text-[9px] text-slate-700">scroll to zoom · drag to pan</p>
        <p className="text-[9px] text-slate-700">click node for details</p>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          edges={dataRef.current.edges}
          allNodes={dataRef.current.nodes}
          onClose={() => {
            selectedRef.current = null;
            setSelectedNode(null);
          }}
        />
      )}
    </div>
  );
}
