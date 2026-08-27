import { useState, useCallback } from 'react';
import type { LensAccount, LensSocialGraph } from '../hooks/useLensProfile';
import { fetchLensSocialGraph } from '../hooks/useLensProfile';
import { Icon } from './Icons';

/* ─── Types ─── */
interface TreeNode {
  account: LensAccount;
  type: 'root' | 'mutual' | 'following' | 'follower';
  children?: { mutuals: TreeNode[]; following: TreeNode[]; followers: TreeNode[] };
  loading?: boolean;
  stats?: { followers: number; following: number };
}

type IconComponent = typeof Icon.Check;

const TYPE_ICONS: Record<string, IconComponent> = {
  root: Icon.Globe,
  mutual: Icon.Users,
  following: Icon.ArrowRight,
  follower: Icon.ArrowLeft,
};

// Colours mirror the legend in LensSocialGraph (root = accent, mutual/following/follower tints)
const TYPE_COLORS: Record<string, string> = {
  root: 'text-[#7da2ff]',
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
  const TypeIcon = TYPE_ICONS[node.type];

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
        className={`py-1.5 px-2 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors duration-150 text-sm ${
          depth === 0 ? 'text-base' : ''
        }`}
        style={{ paddingLeft: Math.max(8, depth * 20) }}
        onClick={toggleOrExpand}
      >
        {/* Main row */}
        <div className="flex items-center gap-1.5 font-mono min-w-0">
          {/* Tree connector */}
          {depth > 0 && (
            <span className="text-fg-subtle select-none flex-shrink-0">├─</span>
          )}

          {/* Expand/collapse icon */}
          <span className="w-4 flex items-center justify-center flex-shrink-0 select-none">
            {node.loading ? (
              <Icon.Refresh size={12} className="animate-spin text-fg-subtle" />
            ) : hasChildren || canExpand ? (
              <Icon.ChevronDown
                size={14}
                className={`text-fg-subtle transition-transform duration-150 ${open && hasChildren ? '' : '-rotate-90'}`}
              />
            ) : (
              <span className="text-fg-subtle">·</span>
            )}
          </span>

          {/* Icon + name */}
          <TypeIcon size={14} className={`flex-shrink-0 ${TYPE_COLORS[node.type]}`} />
          <span className={`font-semibold ${TYPE_COLORS[node.type]} truncate min-w-0`}>
            {displayName}
          </span>

          {/* Handle */}
          {handle && name && (
            <a
              href={`https://hey.xyz/u/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-subtle hover:text-accent transition-colors flex-shrink-0"
              onClick={e => e.stopPropagation()}
            >
              @{handle}
            </a>
          )}

          {/* Stats badge */}
          {node.stats && (
            <span className="text-fg-subtle text-xs ml-auto flex-shrink-0">
              {node.stats.followers}↓ {node.stats.following}↑
            </span>
          )}
        </div>

        {/* Bio on second line — full width, no truncation issues */}
        {bio && (
          <div
            className="text-fg-subtle text-xs mt-0.5 leading-relaxed"
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
              label={`Mutual (${node.children.mutuals.length})`}
              icon={Icon.Users}
              nodes={node.children.mutuals}
              depth={depth + 1}
              onExpand={onExpand}
              defaultOpen={depth === 0}
              color="text-emerald-500"
            />
          )}
          {node.children.following.length > 0 && (
            <FolderGroup
              label={`Following (${node.children.following.length})`}
              icon={Icon.ArrowRight}
              nodes={node.children.following}
              depth={depth + 1}
              onExpand={onExpand}
              defaultOpen={depth === 0}
              color="text-violet-500"
            />
          )}
          {node.children.followers.length > 0 && (
            <FolderGroup
              label={`Followers (${node.children.followers.length})`}
              icon={Icon.ArrowLeft}
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
  icon: GroupIcon,
  nodes,
  depth,
  onExpand,
  defaultOpen,
  color,
}: {
  label: string;
  icon: IconComponent;
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
        className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors duration-150 font-mono text-sm min-w-0"
        style={{ paddingLeft: Math.max(8, depth * 20) }}
        onClick={() => setOpen(!open)}
      >
        {depth > 0 && <span className="text-fg-subtle select-none flex-shrink-0">├─</span>}
        <span className="w-4 flex items-center justify-center flex-shrink-0 select-none">
          <Icon.ChevronDown size={14} className={`text-fg-subtle transition-transform duration-150 ${open ? '' : '-rotate-90'}`} />
        </span>
        <GroupIcon size={14} className={`flex-shrink-0 ${color}`} />
        <span className={`font-semibold ${color} truncate`}>{label}</span>
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
    <div className="card overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon.Users size={16} className="text-fg-muted" /> Tree View
        </h3>
        <span className="text-[10px] text-fg-subtle">Click a row to expand · Recursive</span>
      </div>
      <div className="min-w-0">
        <TreeNodeRow node={tree} depth={0} onExpand={handleExpand} />
      </div>
    </div>
  );
}
