import { useRef, useEffect, useState, useCallback } from 'react';
import type { LensAccount, LensSocialGraph as LensSocialGraphData } from '../hooks/useLensProfile';
import { fetchLensAccount, fetchLensSocialGraph } from '../hooks/useLensProfile';
import { Icon } from './Icons';

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */
interface GNode {
  id: string;
  address: string;
  name: string;
  handle: string | null;
  bio: string | null;
  picture: string | null;
  type: 'root' | 'mutual' | 'following' | 'follower' | 'expanded';
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  expanded: boolean;
  depth: number;
  parentId: string | null;
  childIds: string[];
  followerCount: number | null;
  followingCount: number | null;
  _dragging?: boolean;
}

interface GLink {
  source: string;
  target: string;
  type: string;
}

const COLORS: Record<string, string> = {
  root: '#0055ff',
  mutual: '#00cc88',
  following: '#7c5cfc',
  follower: '#ff6b9d',
  expanded: '#ff9f43',
};

/* ═══════════════════════════════════════
   Component
   ═══════════════════════════════════════ */
interface Props {
  rootAccount: LensAccount;
  initialGraph: LensSocialGraphData;
}

export default function LensSocialGraph({ rootAccount, initialGraph }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewMode, setViewMode] = useState<'force' | 'orbit'>('force');
  const [statusText, setStatusText] = useState('');
  const [loadingNode, setLoadingNode] = useState<string | null>(null);

  // All mutable state in refs to avoid re-renders
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const nodeMapRef = useRef<Record<string, GNode>>({});
  const expandedRef = useRef<Set<string>>(new Set());
  const imgCacheRef = useRef<Record<string, HTMLImageElement | null>>({});
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });
  const hoveredRef = useRef<GNode | null>(null);
  const viewRef = useRef(viewMode);
  const orbitTimeRef = useRef(0);

  viewRef.current = viewMode;

  /* ─── Graph mutation helpers ─── */
  const preloadImg = useCallback((url: string | null) => {
    if (!url || imgCacheRef.current[url] !== undefined) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => { imgCacheRef.current[url] = img; };
    img.onerror = () => { imgCacheRef.current[url] = null; };
    imgCacheRef.current[url] = null; // mark as loading
  }, []);

  const addNode = useCallback((account: LensAccount, type: GNode['type'], parentId: string | null, depth: number): GNode => {
    const id = account.address;
    const map = nodeMapRef.current;
    const nodes = nodesRef.current;
    const links = linksRef.current;

    if (map[id]) {
      // Already exists, just add link if needed
      if (parentId && !links.find(l => (l.source === parentId && l.target === id) || (l.source === id && l.target === parentId))) {
        links.push({ source: parentId, target: id, type });
      }
      return map[id];
    }

    const parent = parentId ? map[parentId] : null;
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 60;
    const canvas = canvasRef.current;

    const node: GNode = {
      id, address: account.address,
      name: account.metadata?.name || account.username?.localName || account.address.slice(0, 8),
      handle: account.username?.localName || null,
      bio: account.metadata?.bio || null,
      picture: account.metadata?.picture || null,
      type,
      x: parent ? parent.x + Math.cos(angle) * dist : (canvas?.width || 800) / 2,
      y: parent ? parent.y + Math.sin(angle) * dist : (canvas?.height || 500) / 2,
      vx: 0, vy: 0,
      r: type === 'root' ? 24 : Math.max(8, 18 - depth * 3),
      expanded: false, depth, parentId,
      childIds: [],
      followerCount: null, followingCount: null,
    };

    nodes.push(node);
    map[id] = node;

    if (parentId) {
      links.push({ source: parentId, target: id, type });
      if (map[parentId]) map[parentId].childIds.push(id);
    }

    preloadImg(node.picture);
    return node;
  }, [preloadImg]);

  const removeNodeAndChildren = useCallback((id: string) => {
    const map = nodeMapRef.current;
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const node = map[id];
    if (!node) return;

    [...node.childIds].forEach(cid => removeNodeAndChildren(cid));

    for (let i = links.length - 1; i >= 0; i--) {
      if (links[i].source === id || links[i].target === id) links.splice(i, 1);
    }

    if (node.parentId && map[node.parentId]) {
      map[node.parentId].childIds = map[node.parentId].childIds.filter(c => c !== id);
    }

    const idx = nodes.indexOf(node);
    if (idx !== -1) nodes.splice(idx, 1);
    delete map[id];
    expandedRef.current.delete(id);
  }, []);

  const expandNode = useCallback(async (id: string) => {
    if (expandedRef.current.has(id)) return;
    const node = nodeMapRef.current[id];
    if (!node) return;

    setLoadingNode(id);
    setStatusText(`Loading ${node.handle || node.name}…`);

    try {
      const graph = await fetchLensSocialGraph(node.address);
      node.expanded = true;
      node.followerCount = graph.stats.followers;
      node.followingCount = graph.stats.following;
      expandedRef.current.add(id);
      if (node.type !== 'root') node.type = 'expanded';

      graph.mutuals.forEach(a => addNode(a, 'mutual', id, node.depth + 1));
      graph.followingOnly.forEach(a => addNode(a, 'following', id, node.depth + 1));
      graph.followersOnly.forEach(a => addNode(a, 'follower', id, node.depth + 1));

      updateStatus();
    } catch (e) {
      console.error('Expand failed:', e);
    }

    setLoadingNode(null);
    setStatusText('');
  }, [addNode]);

  const collapseNode = useCallback((id: string) => {
    const node = nodeMapRef.current[id];
    if (!node?.expanded) return;
    [...node.childIds].forEach(cid => removeNodeAndChildren(cid));
    node.expanded = false;
    node.childIds = [];
    expandedRef.current.delete(id);
    updateStatus();
  }, [removeNodeAndChildren]);

  const [graphStats, setGraphStats] = useState({ nodes: 0, links: 0, expanded: 0 });
  const updateStatus = useCallback(() => {
    setGraphStats({ nodes: nodesRef.current.length, links: linksRef.current.length, expanded: expandedRef.current.size });
  }, []);

  /* ─── Initialize ─── */
  useEffect(() => {
    const root = addNode(rootAccount, 'root', null, 0);
    root.expanded = true;
    root.followerCount = initialGraph.stats.followers;
    root.followingCount = initialGraph.stats.following;
    expandedRef.current.add(root.id);

    initialGraph.mutuals.forEach(a => addNode(a, 'mutual', root.id, 1));
    initialGraph.followingOnly.forEach(a => addNode(a, 'following', root.id, 1));
    initialGraph.followersOnly.forEach(a => addNode(a, 'follower', root.id, 1));

    camRef.current.x = root.x;
    camRef.current.y = root.y;
    updateStatus();
  }, []); // run once

  /* ─── Physics ─── */
  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const map = nodeMapRef.current;

    if (viewRef.current === 'orbit') {
      orbitTimeRef.current += 0.005;
      const root = nodes[0];
      if (!root) return;

      if (!root._dragging) {
        const canvas = canvasRef.current;
        const cx = (canvas?.width || 800) / 2;
        const cy = (canvas?.height || 500) / 2;
        const cam = camRef.current;
        root.x += (cam.x - root.x) * 0.01 || 0;
        root.y += (cam.y - root.y) * 0.01 || 0;
      }

      const positionChildren = (parent: GNode) => {
        const children = nodes.filter(n => n.parentId === parent.id);
        if (!children.length) return;

        const groups: Record<string, GNode[]> = {};
        children.forEach(c => { (groups[c.type] ??= []).push(c); });

        let ringIdx = 0;
        const t = orbitTimeRef.current;
        for (const [type, members] of Object.entries(groups)) {
          if (!members.length) continue;
          const baseRadius = 80 + ringIdx * 55 + (parent.depth) * 15;
          const speed = type === 'mutual' ? 0.3 : type === 'following' ? -0.2 : 0.15;

          members.forEach((m, i) => {
            const angle = (i / members.length) * Math.PI * 2 + t * speed;
            const tx = parent.x + Math.cos(angle) * baseRadius;
            const ty = parent.y + Math.sin(angle) * baseRadius;
            if (!m._dragging) {
              m.x += (tx - m.x) * 0.05;
              m.y += (ty - m.y) * 0.05;
            }
            if (m.expanded) positionChildren(m);
          });
          ringIdx++;
        }
      };

      positionChildren(root);
      return;
    }

    // Force mode
    const root = nodes[0];
    nodes.forEach(n => {
      if (n._dragging || !root) return;
      n.vx += (root.x - n.x) * 0.0003;
      n.vy += (root.y - n.y) * 0.0003;
    });

    links.forEach(l => {
      const s = map[l.source], t = map[l.target];
      if (!s || !t) return;
      const dx = t.x - s.x, dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ideal = 100 + s.r + t.r;
      const force = (dist - ideal) * 0.004;
      const fx = dx / dist * force, fy = dy / dist * force;
      if (!s._dragging) { s.vx += fx; s.vy += fy; }
      if (!t._dragging) { t.vx -= fx; t.vy -= fy; }
    });

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 200) {
          const force = 600 / (dist * dist);
          const fx = dx / dist * force, fy = dy / dist * force;
          if (!a._dragging) { a.vx -= fx; a.vy -= fy; }
          if (!b._dragging) { b.vx += fx; b.vy += fy; }
        }
      }
    }

    nodes.forEach(n => {
      if (n._dragging) return;
      n.vx *= 0.88; n.vy *= 0.88;
      n.x += n.vx; n.y += n.vy;
    });
  }, []);

  /* ─── Render loop ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf: number;

    const resize = () => {
      const parent = canvas.parentElement!;
      canvas.width = parent.clientWidth;
      canvas.height = 500;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      simulate();
      const W = canvas.width, H = canvas.height;
      const cam = camRef.current;
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const map = nodeMapRef.current;
      const hovered = hoveredRef.current;

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // Orbit rings
      if (viewRef.current === 'orbit') {
        nodes.filter(n => n.expanded).forEach(parent => {
          const children = nodes.filter(c => c.parentId === parent.id);
          if (!children.length) return;
          const groups: Record<string, GNode[]> = {};
          children.forEach(c => { (groups[c.type] ??= []).push(c); });
          let ringIdx = 0;
          for (const [type, members] of Object.entries(groups)) {
            if (!members.length) continue;
            const radius = 80 + ringIdx * 55 + parent.depth * 15;
            ctx.beginPath();
            ctx.arc(parent.x, parent.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = (COLORS[type] || '#444') + '15';
            ctx.lineWidth = 1;
            ctx.stroke();
            ringIdx++;
          }
        });
      }

      // Links
      links.forEach(l => {
        const s = map[l.source], t = map[l.target];
        if (!s || !t) return;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = (COLORS[l.type] || '#333') + '25';
        ctx.lineWidth = l.type === 'mutual' ? 1.5 : 0.8;
        ctx.stroke();
      });

      // Nodes
      nodes.forEach(n => {
        const isHover = hovered === n;
        const r = isHover ? n.r + 4 : n.r;
        const color = n.expanded && n.type !== 'root' ? COLORS.expanded : COLORS[n.type] || '#666';

        // Glow
        if (isHover || n.type === 'root') {
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r + 12);
          grad.addColorStop(0, color + '40');
          grad.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 12, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Expansion ring
        if (n.expanded) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = COLORS.expanded + '60';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Avatar or circle
        const img = n.picture ? imgCacheRef.current[n.picture] : null;
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, n.x - r, n.y - r, r * 2, r * 2);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = color + (isHover ? 'ff' : 'cc');
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.max(9, r * 0.8)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.type === 'root' ? '🌿' : (n.handle || n.name || '?')[0].toUpperCase(), n.x, n.y + 1);
        }

        // Label
        if (r > 10 || isHover || n.depth <= 1) {
          ctx.font = `${isHover ? 11 : 9}px monospace`;
          ctx.fillStyle = isHover ? '#fff' : '#777';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const label = n.handle || n.name;
          ctx.fillText(label.length > 16 ? label.slice(0, 14) + '..' : label, n.x, n.y + r + 5);
        }

        // Stats badge
        if (n.followerCount !== null && (n.expanded || isHover)) {
          ctx.font = '8px monospace';
          ctx.fillStyle = '#555';
          ctx.textAlign = 'center';
          ctx.fillText(`${n.followerCount}↓ ${n.followingCount}↑`, n.x, n.y + r + 17);
        }
      });

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [simulate]);

  /* ─── Interaction handlers ─── */
  const screenToWorld = (sx: number, sy: number) => {
    const canvas = canvasRef.current!;
    const cam = camRef.current;
    return {
      x: (sx - canvas.width / 2) / cam.zoom + cam.x,
      y: (sy - canvas.height / 2) / cam.zoom + cam.y,
    };
  };

  const hitTest = (sx: number, sy: number): GNode | null => {
    const w = screenToWorld(sx, sy);
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - w.x, dy = n.y - w.y;
      if (Math.sqrt(dx * dx + dy * dy) < n.r + 4) return n;
    }
    return null;
  };

  const dragRef = useRef<{ node: GNode | null; panning: boolean; last: { x: number; y: number }; startTime: number }>({
    node: null, panning: false, last: { x: 0, y: 0 }, startTime: 0,
  });
  const pinchRef = useRef<{ dist: number } | null>(null);
  const lastTapRef = useRef<{ time: number; id: string | null }>({ time: 0, id: null });

  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GNode } | null>(null);

  /* ─── Mouse handlers ─── */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const hit = hitTest(sx, sy);
    hoveredRef.current = hit;

    if (hit) {
      setTooltip({ x: e.clientX, y: e.clientY, node: hit });
    } else {
      setTooltip(null);
    }

    const drag = dragRef.current;
    if (drag.node?._dragging) {
      const w = screenToWorld(sx, sy);
      drag.node.x = w.x;
      drag.node.y = w.y;
    } else if (drag.panning) {
      const cam = camRef.current;
      cam.x -= (e.clientX - drag.last.x) / cam.zoom;
      cam.y -= (e.clientY - drag.last.y) / cam.zoom;
    }
    drag.last = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    const drag = dragRef.current;
    drag.last = { x: e.clientX, y: e.clientY };
    if (hit) {
      drag.node = hit;
      hit._dragging = true;
      drag.startTime = Date.now();
    } else {
      drag.panning = true;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag.node) {
      const wasDrag = Date.now() - drag.startTime > 200;
      drag.node._dragging = false;
      if (!wasDrag) expandNode(drag.node.id);
      drag.node = null;
    }
    drag.panning = false;
  }, [expandNode]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit?.expanded && hit.type !== 'root') collapseNode(hit.id);
  }, [collapseNode]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    camRef.current.zoom = Math.max(0.1, Math.min(5, camRef.current.zoom * factor));
  }, []);

  /* ─── Touch handlers (mobile) ─── */
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy) };
      return;
    }

    const touch = e.touches[0];
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = touch.clientX - rect.left, sy = touch.clientY - rect.top;
    const hit = hitTest(sx, sy);
    const drag = dragRef.current;
    drag.last = { x: touch.clientX, y: touch.clientY };
    drag.startTime = Date.now();

    if (hit) {
      drag.node = hit;
      hit._dragging = true;
    } else {
      drag.panning = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = dist / pinchRef.current.dist;
      camRef.current.zoom = Math.max(0.1, Math.min(5, camRef.current.zoom * factor));
      pinchRef.current.dist = dist;
      return;
    }

    const touch = e.touches[0];
    const drag = dragRef.current;

    if (drag.node?._dragging) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const w = screenToWorld(touch.clientX - rect.left, touch.clientY - rect.top);
      drag.node.x = w.x;
      drag.node.y = w.y;
    } else if (drag.panning) {
      const cam = camRef.current;
      cam.x -= (touch.clientX - drag.last.x) / cam.zoom;
      cam.y -= (touch.clientY - drag.last.y) / cam.zoom;
    }
    drag.last = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
    const drag = dragRef.current;

    if (drag.node) {
      const wasDrag = Date.now() - drag.startTime > 200;
      drag.node._dragging = false;

      if (!wasDrag) {
        const now = Date.now();
        const last = lastTapRef.current;

        // Double-tap on same node = collapse
        if (last.id === drag.node.id && now - last.time < 350) {
          if (drag.node.expanded && drag.node.type !== 'root') {
            collapseNode(drag.node.id);
          }
          lastTapRef.current = { time: 0, id: null };
        } else {
          // Single tap = expand (after brief delay to detect double-tap)
          const nodeId = drag.node.id;
          lastTapRef.current = { time: now, id: nodeId };
          setTimeout(() => {
            // Only expand if no second tap happened
            if (lastTapRef.current.time === now) {
              expandNode(nodeId);
              lastTapRef.current = { time: 0, id: null };
            }
          }, 360);
        }
      }
      drag.node = null;
    }
    drag.panning = false;
  }, [expandNode, collapseNode]);

  const legend = Object.entries(COLORS).map(([k, c]) => (
    <span key={k} className="flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
      {k}
    </span>
  ));

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
          <Icon.Users size={18} className="text-fg-muted" /> Lens Social Graph
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-fg-subtle">
            {graphStats.nodes} accounts · {graphStats.links} connections
          </span>
          <div className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setViewMode('force')}
              aria-pressed={viewMode === 'force'}
              className={`btn btn-sm ${viewMode === 'force' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Force
            </button>
            <button
              type="button"
              onClick={() => setViewMode('orbit')}
              aria-pressed={viewMode === 'orbit'}
              className={`btn btn-sm ${viewMode === 'orbit' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Orbit
            </button>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <canvas
          ref={canvasRef}
          className="w-full cursor-grab active:cursor-grabbing touch-none"
          style={{ height: 500 }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setTooltip(null); hoveredRef.current = null; dragRef.current.panning = false; }}
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* Loading overlay */}
        {loadingNode && (
          <div className="absolute left-1/2 top-3 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5 truncate rounded-full bg-accent px-4 py-1.5 text-xs text-white">
            <Icon.Refresh size={12} className="animate-spin" /> {statusText}
          </div>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none fixed z-50 max-w-[260px] rounded-lg border border-line-strong bg-surface px-4 py-3 shadow-2xl shadow-black/50"
            style={{ left: Math.min(tooltip.x + 15, window.innerWidth - 280), top: Math.max(tooltip.y - 90, 10) }}
          >
            <div className="text-sm font-semibold text-fg">{tooltip.node.name}</div>
            {tooltip.node.handle && <div className="font-mono text-xs text-[#7da2ff]">@{tooltip.node.handle}</div>}
            {tooltip.node.bio && <div className="mt-1 line-clamp-2 text-xs text-fg-muted">{tooltip.node.bio}</div>}
            {tooltip.node.followerCount !== null && (
              <div className="mt-1.5 flex gap-3 text-xs text-fg-muted">
                <span className="inline-flex items-center gap-1"><Icon.Users size={12} /> {tooltip.node.followerCount}</span>
                <span className="inline-flex items-center gap-1"><Icon.ArrowRight size={12} /> {tooltip.node.followingCount}</span>
              </div>
            )}
            <div className="mt-1.5 text-[10px]" style={{ color: tooltip.node.expanded ? COLORS.follower : COLORS.root }}>
              {tooltip.node.expanded ? 'Double-tap / right-click to collapse' : 'Tap / click to expand graph'}
            </div>
          </div>
        )}

        {/* Legend + instructions (desktop overlays; on mobile they move below the canvas so nothing overlaps) */}
        <div className="absolute bottom-3 left-3 hidden gap-3 rounded-lg bg-bg/80 px-3 py-1.5 text-[10px] text-fg-muted sm:flex">
          {legend}
        </div>
        <div className="absolute bottom-3 right-3 hidden rounded-lg bg-bg/80 px-3 py-1.5 text-[10px] text-fg-subtle sm:block">
          Click = expand · Right-click = collapse · Drag = move · Scroll = zoom
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-fg-muted sm:hidden">
        {legend}
        <span className="basis-full text-fg-subtle">Tap = expand · Double-tap = collapse · Pinch = zoom</span>
      </div>
    </div>
  );
}
