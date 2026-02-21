import { useState, useEffect, useCallback } from 'react';

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

/* ─── Public: search Lens account by name (fallback when wallet doesn't match) ─── */
export async function searchLensAccount(query: string): Promise<LensAccount | null> {
  const d = await lensGQL(
    `{ accounts(request: { filter: { searchBy: { localNameQuery: "${query}" } }, orderBy: BEST_MATCH, pageSize: TEN }) { items { address username { localName } metadata { name bio picture } } } }`
  );
  const items: LensAccount[] = d?.accounts?.items || [];
  // STRICT: only return exact localName match — no fuzzy/partial results
  const exact = items.find((a) => a.username?.localName?.toLowerCase() === query.toLowerCase());
  return exact || null;
}

/* ─── Deduplicate consecutive chars: "daaaaab" → "dab", "littl3lobst3r" → "litl3lobst3r" ─── */
function dedup(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

/* ─── Check if two handles are likely the same person ─── */
function isLikelyMatch(query: string, found: string): boolean {
  const q = query.toLowerCase();
  const f = found.toLowerCase();
  // Exact
  if (q === f) return true;
  // One contains the other (lengths must be close)
  if ((q.includes(f) || f.includes(q)) && Math.abs(q.length - f.length) <= 2) return true;
  // Deduplicated versions match (daaaaab→dab vs daaab→dab)
  if (dedup(q) === dedup(f)) return true;
  // Strip numbers and compare (littl3lobst3r vs littlelobster → reject if too different)
  const qAlpha = q.replace(/[^a-z]/g, '');
  const fAlpha = f.replace(/[^a-z]/g, '');
  if (qAlpha === fAlpha) return true;
  if (dedup(qAlpha) === dedup(fAlpha)) return true;
  return false;
}

/* ─── Smart Lens lookup: try wallet first, then search by handle/basename ─── */
export async function smartLensLookup(address: string, handle?: string | null): Promise<LensAccount | null> {
  // 1. Try direct wallet lookup
  const direct = await fetchLensAccount(address);
  if (direct?.username) return direct;

  // 2. Search by handle and verify match
  if (handle) {
    const cleanHandle = handle.replace(/\.base\.eth$/i, '').replace(/\.eth$/i, '');

    // 2a. Exact search
    const searched = await searchLensAccount(cleanHandle);
    if (searched?.username) return searched;

    // 2b. Search results from original query — check top results for likely match
    const d = await lensGQL(
      `{ accounts(request: { filter: { searchBy: { localNameQuery: "${cleanHandle}" } }, orderBy: BEST_MATCH, pageSize: TEN }) { items { address username { localName } metadata { name bio picture } } } }`
    );
    const items: LensAccount[] = d?.accounts?.items || [];
    for (const item of items) {
      if (item.username?.localName && isLikelyMatch(cleanHandle, item.username.localName)) {
        return item;
      }
    }
  }

  return null;
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

/* ─── Hook: lightweight Lens account check (no graph fetch) ─── */
export function useLensAccount(walletAddress: string | null, handle?: string | null) {
  const [account, setAccount] = useState<LensAccount | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    setLoading(true);

    smartLensLookup(walletAddress, handle)
      .then(a => { if (!cancelled) setAccount(a); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [walletAddress, handle]);

  return { account, loading };
}

/* ─── Hook: on-demand full profile + graph ─── */
export function useLensProfileOnDemand(lensAccount: LensAccount | null) {
  const [profile, setProfile] = useState<LensProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!lensAccount || loading || profile) return;
    setLoading(true);
    setError(null);

    try {
      const graph = await fetchLensSocialGraph(lensAccount.address);
      setProfile({ account: lensAccount, graph });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [lensAccount, loading, profile]);

  return { profile, loading, error, load };
}
