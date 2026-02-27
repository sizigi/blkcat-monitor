import type { SessionInfo } from "@blkcat/shared";

export interface CwdGroup {
  cwdRoot: string;
  sessions: SessionInfo[];
}

export function shortenPath(p: string): string {
  return p.replace(/^\/home\/[^/]+/, "~").replace(/^\/root/, "~");
}

export function buildCwdGroups(sessions: SessionInfo[]): { groups: CwdGroup[]; ungrouped: SessionInfo[] } {
  // 1. Collect anchor roots from CLI sessions
  const anchorSet = new Set<string>();
  for (const s of sessions) {
    if (s.cliTool && s.cwd) anchorSet.add(s.cwd);
  }
  // 2. Sort shortest-first; merge subdirectory anchors into parent
  let anchors = [...anchorSet].sort((a, b) => a.length - b.length);
  const merged: string[] = [];
  for (const a of anchors) {
    const parent = merged.find((m) => a === m || a.startsWith(m + "/"));
    if (!parent) merged.push(a);
  }
  anchors = merged;

  // 3. Assign each session to best matching anchor (longest match)
  const groupMap = new Map<string, SessionInfo[]>();
  for (const a of anchors) groupMap.set(a, []);
  const remaining: SessionInfo[] = [];

  for (const s of sessions) {
    if (!s.cwd) {
      remaining.push(s);
      continue;
    }
    let bestAnchor: string | null = null;
    for (const a of anchors) {
      if (s.cwd === a || s.cwd.startsWith(a + "/")) {
        if (!bestAnchor || a.length > bestAnchor.length) bestAnchor = a;
      }
    }
    if (bestAnchor) {
      groupMap.get(bestAnchor)!.push(s);
    } else {
      remaining.push(s);
    }
  }

  // 4. Group remaining sessions by cwd — only truly cwdless sessions stay ungrouped
  const ungrouped: SessionInfo[] = [];
  const extraMap = new Map<string, SessionInfo[]>();
  for (const s of remaining) {
    if (s.cwd) {
      const list = extraMap.get(s.cwd) ?? [];
      list.push(s);
      extraMap.set(s.cwd, list);
    } else {
      ungrouped.push(s);
    }
  }

  const groups: CwdGroup[] = [
    ...anchors
      .map((a) => ({ cwdRoot: a, sessions: groupMap.get(a)! }))
      .filter((g) => g.sessions.length > 0),
    ...[...extraMap.entries()].map(([root, ss]) => ({ cwdRoot: root, sessions: ss })),
  ];
  return { groups, ungrouped };
}
