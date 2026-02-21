import { useState, useCallback } from 'react';
import type { LensAccount, LensSocialGraph } from '../hooks/useLensProfile';
import { fetchLensSocialGraph } from '../hooks/useLensProfile';

/* ─── Types ─── */
interface TreeNode {
  account: LensAccount;
  type: 'root' | 'mutual' | 'following' | 'follower';
  children?: { mutuals: TreeNode[]; following: TreeNode[]; followers: TreeNode[] };
  loading?: boolean;
  stats?: { followers: number; following: number };
}

const TYPE_ICONS: Record<string, string> = {
  root: '🌿',
  mutual: '🤝',
  following: '➡️',
  follower: '👤',
};

const TYPE_COLORS: Record<string, string> = {
  root: 'text-[#abfe2c]',
  mutual: 'text-emerald-400',
  following: 'text-violet-400',
  follower: 'text-pink-400',
};

/* ─── Single tree node row ─── */
function TreeNodeRow({
  node,
  depth,
  onExpand,
}: {
  node: TreeNode;
  depth: number;
  onExpand: (node: TreeNode) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children && (
    node.children.mutuals.length + node.children.following.length + node.children.followers.length > 0
  );
  const canExpand = !node.children && node.type !== 'root';

  const handle = node.account.username?.localName;
  const name = node.account.metadata?.name;
  const bio = node.account.metadata?.bio;
  const displayName = name || handle || node.account.address.slice(0, 10) + '…';

  const toggleOrExpand = () => {
    if (node.children || node.type === 'root') {
      setOpen(!open);
    } else {
      onExpand(node);
      setOpen(true);
    }
  };

  return (
    <>
      <div
        className={`py-1.5 px-2 rounded hover:bg-gray-800/50 cursor-pointer transition text-sm ${
          depth === 0 ? 'text-base' : ''
        }`}
        style={{ paddingLeft: Math.max(8, depth * 20) }}
        onClick={toggleOrExpand}
      >
        {/* Main row */}
        <div className="flex items-center gap-1.5 font-mono">
          {/* Tree connector */}
          {depth > 0 && (
            <span className="text-gray-600 select-none flex-shrink-0">├─</span>
          )}

          {/* Expand/collapse icon */}
          <span className="w-4 text-center flex-shrink-0 select-none">
            {node.loading ? (
              <span className="animate-spin inline-block">⏳</span>
            ) : hasChildren || canExpand ? (
              <span className={`text-gray-500 transition-transform inline-block ${open && hasChildren ? 'rotate-90' : ''}`}>
                ▶
              </span>
            ) : (
              <span className="text-gray-700">·</span>
            )}
          </span>

          {/* Icon + name */}
          <span className="flex-shrink-0">{TYPE_ICONS[node.type]}</span>
          <span className={`font-bold ${TYPE_COLORS[node.type]} truncate`}>
            {displayName}
          </span>

          {/* Handle */}
          {handle && name && (
            <a
              href={`https://hey.xyz/u/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-base-blue transition flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              @{handle}
            </a>
          )}

          {/* Stats badge */}
          {node.stats && (
            <span className="text-gray-600 text-xs ml-auto flex-shrink-0">
              {node.stats.followers}↓ {node.stats.following}↑
            </span>
          )}
        </div>

        {/* Bio on second line — full width, no truncation issues */}
        {bio && (
          <div
            className="text-gray-500 text-xs mt-0.5 leading-relaxed"
            style={{ paddingLeft: depth > 0 ? 52 : 28 }}
          >
            {bio}
          </div>
        )}
      </div>

      {/* Children */}
      {open && node.children && (
        <div>
          {node.children.mutuals.length > 0 && (
            <FolderGroup
              label={`🤝 Mutual (${node.children.mutuals.length})`}
              nodes={node.children.mutuals}
              depth={depth + 1}
              onExpand={onExpand}
              defaultOpen={depth === 0}
              color="text-emerald-500"
            />
          )}
          {node.children.following.length > 0 && (
            <FolderGroup
              label={`➡️ Following (${node.children.following.length})`}
              nodes={node.children.following}
              depth={depth + 1}
              onExpand={onExpand}
              defaultOpen={depth === 0}
              color="text-violet-500"
            />
          )}
          {node.children.followers.length > 0 && (
            <FolderGroup
              label={`👤 Followers (${node.children.followers.length})`}
              nodes={node.children.followers}
              depth={depth + 1}
              onExpand={onExpand}
              defaultOpen={depth === 0}
              color="text-pink-500"
            />
          )}
        </div>
      )}
    </>
  );
}

/* ─── Folder group (Mutual / Following / Followers) ─── */
function FolderGroup({
  label,
  nodes,
  depth,
  onExpand,
  defaultOpen,
  color,
}: {
  label: string;
  nodes: TreeNode[];
  depth: number;
  onExpand: (node: TreeNode) => void;
  defaultOpen: boolean;
  color: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <>
      <div
        className="flex items-center gap-1.5 py-1.5 px-2 rounded hover:bg-gray-800/50 cursor-pointer transition font-mono text-sm"
        style={{ paddingLeft: Math.max(8, depth * 20) }}
        onClick={() => setOpen(!open)}
      >
        {depth > 0 && <span className="text-gray-600 select-none flex-shrink-0">├─</span>}
        <span className="w-4 text-center flex-shrink-0 select-none">
          <span className={`text-gray-500 transition-transform inline-block ${open ? 'rotate-90' : ''}`}>▶</span>
        </span>
        <span className={`font-semibold ${color}`}>📁 {label}</span>
      </div>
      {open && nodes.map((n, i) => (
        <TreeNodeRow key={n.account.address + i} node={n} depth={depth + 1} onExpand={onExpand} />
      ))}
    </>
  );
}

/* ─── Main component ─── */
interface Props {
  rootAccount: LensAccount;
  initialGraph: LensSocialGraph;
}

export default function LensTreeView({ rootAccount, initialGraph }: Props) {
  const [tree, setTree] = useState<TreeNode>(() => buildTree(rootAccount, initialGraph));

  function buildTree(account: LensAccount, graph: LensSocialGraph): TreeNode {
    return {
      account,
      type: 'root',
      children: {
        mutuals: graph.mutuals.map(a => ({ account: a, type: 'mutual' as const })),
        following: graph.followingOnly.map(a => ({ account: a, type: 'following' as const })),
        followers: graph.followersOnly.map(a => ({ account: a, type: 'follower' as const })),
      },
      stats: { followers: graph.stats.followers, following: graph.stats.following },
    };
  }

  const handleExpand = useCallback(async (target: TreeNode) => {
    if (target.children || target.loading) return;

    // Mark loading
    target.loading = true;
    setTree(t => ({ ...t })); // force re-render

    try {
      const graph = await fetchLensSocialGraph(target.account.address);
      target.children = {
        mutuals: graph.mutuals.map(a => ({ account: a, type: 'mutual' as const })),
        following: graph.followingOnly.map(a => ({ account: a, type: 'following' as const })),
        followers: graph.followersOnly.map(a => ({ account: a, type: 'follower' as const })),
      };
      target.stats = { followers: graph.stats.followers, following: graph.stats.following };
    } catch {
      // silently fail
    }

    target.loading = false;
    setTree(t => ({ ...t }));
  }, []);

  return (
    <div className="bg-base-gray rounded-xl border border-gray-800 p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          📂 Tree View
        </h3>
        <span className="text-[10px] text-gray-500">Click ▶ to expand · Recursive</span>
      </div>
      <div className="min-w-0">
        <TreeNodeRow node={tree} depth={0} onExpand={handleExpand} />
      </div>
    </div>
  );
}
