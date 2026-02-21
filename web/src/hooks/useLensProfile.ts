import { useState, useEffect } from 'react';

const LENS_API = 'https://api.lens.xyz/graphql';

/* ─── Types ─── */
export interface LensAccount {
  address: string;
  username: { localName: string } | null;
  metadata: { name: string | null; bio: string | null; picture: string | null } | null;
}

export interface LensSocialGraph {
  mutuals: LensAccount[];
  followersOnly: LensAccount[];
  followingOnly: LensAccount[];
  stats: { followers: number; following: number; mutuals: number };
}

export interface LensProfile {
  account: LensAccount;
  graph: LensSocialGraph;
}

/* ─── GraphQL helper ─── */
async function lensGQL(query: string) {
  const res = await fetch(LENS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  return json.data;
}

/* ─── Fetch paginated lists ─── */
async function fetchAllFollowers(address: string): Promise<LensAccount[]> {
  const all: LensAccount[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const after = cursor ? `, cursor: "${cursor}"` : '';
    const d = await lensGQL(
      `{ followers(request: { account: "${address}", pageSize: FIFTY ${after} }) { items { follower { address username { localName } metadata { name bio picture } } } pageInfo { next } } }`
    );
    const items = d?.followers?.items || [];
    all.push(...items.map((i: any) => i.follower));
    cursor = d?.followers?.pageInfo?.next;
    if (!cursor || !items.length) break;
  }
  return all;
}

async function fetchAllFollowing(address: string): Promise<LensAccount[]> {
  const all: LensAccount[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const after = cursor ? `, cursor: "${cursor}"` : '';
    const d = await lensGQL(
      `{ following(request: { account: "${address}", pageSize: FIFTY ${after} }) { items { following { address username { localName } metadata { name bio picture } } } pageInfo { next } } }`
    );
    const items = d?.following?.items || [];
    all.push(...items.map((i: any) => i.following));
    cursor = d?.following?.pageInfo?.next;
    if (!cursor || !items.length) break;
  }
  return all;
}

/* ─── Public: fetch account by address ─── */
export async function fetchLensAccount(address: string): Promise<LensAccount | null> {
  const d = await lensGQL(
    `{ account(request: { address: "${address}" }) { address username { localName } metadata { name bio picture } } }`
  );
  return d?.account || null;
}

/* ─── Public: fetch social graph for an address ─── */
export async function fetchLensSocialGraph(address: string): Promise<LensSocialGraph> {
  const [followers, following] = await Promise.all([
    fetchAllFollowers(address),
    fetchAllFollowing(address),
  ]);
  const followerAddrs = new Set(followers.map(f => f.address));
  const followingAddrs = new Set(following.map(f => f.address));
  const mutualAddrs = new Set([...followerAddrs].filter(a => followingAddrs.has(a)));

  return {
    mutuals: followers.filter(f => mutualAddrs.has(f.address)),
    followersOnly: followers.filter(f => !mutualAddrs.has(f.address)),
    followingOnly: following.filter(f => !mutualAddrs.has(f.address)),
    stats: { followers: followers.length, following: following.length, mutuals: mutualAddrs.size },
  };
}

/* ─── Hook ─── */
export function useLensProfile(walletAddress: string | null) {
  const [profile, setProfile] = useState<LensProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const account = await fetchLensAccount(walletAddress);
        if (cancelled) return;
        if (!account) { setLoading(false); return; }

        const graph = await fetchLensSocialGraph(walletAddress);
        if (cancelled) return;

        setProfile({ account, graph });
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [walletAddress]);

  return { profile, loading, error };
}
