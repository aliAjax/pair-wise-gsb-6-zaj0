// 合并规则：纯函数，不读 localStorage、不感知 React。
//
// 规则（标题相同视为同一条）：
//   - 本地没有            → add（新增，收藏并入计数）
//   - 本地有且内容全等    → identical（不动本地，收藏保留本地值）
//   - 本地有但字体/正文不一致 → conflict；默认保留本地(local)，
//     预览里逐项可改为 incoming。冲突未决前本地记录绝不被覆盖。
// 收藏不一致只作为差异提示（diffs.favorite），不单独构成冲突：
// 收藏是本地状态，add 时采用包内值，其余情况仅在选择 incoming 时覆盖。

import type {
  AppliedMerge,
  FieldDiffs,
  IncomingItem,
  MergePlan,
  MergeRow,
  Pair,
  Resolution,
  TypoDraft,
} from './types';

export const DEFAULT_TYPO: TypoDraft = {
  headingFont: 'Fraunces',
  bodyFont: 'DM Sans',
  size: 46,
  weight: 600,
  leading: 1.25,
  tracking: 0,
};

const noDiffs = (): FieldDiffs => ({
  heading: false,
  headingFont: false,
  bodyFont: false,
  body: false,
  favorite: false,
});

function computeDiffs(local: Pair, inc: IncomingItem): FieldDiffs {
  return {
    heading: local.heading !== inc.heading,
    headingFont: local.headingFont !== inc.headingFont,
    bodyFont: local.bodyFont !== inc.bodyFont,
    body: local.body !== inc.body,
    favorite: local.favorite !== inc.favorite,
  };
}

const hasContentConflict = (d: FieldDiffs) =>
  d.heading || d.headingFont || d.bodyFont || d.body;

export function buildPlan(local: Pair[], items: IncomingItem[]): MergePlan {
  const byTitle = new Map<string, Pair>();
  for (const p of local) byTitle.set(p.title, p);

  // 包内同标题去重，取最后一条（validation 已对此给出警告）。
  const incomingByTitle = new Map<string, IncomingItem>();
  for (const it of items) incomingByTitle.set(it.title, it);

  const rows: MergeRow[] = [];
  for (const [title, inc] of incomingByTitle) {
    const localPair = byTitle.get(title) ?? null;
    if (!localPair) {
      rows.push({
        key: `add:${title}`,
        kind: 'add',
        title,
        local: null,
        incoming: inc,
        diffs: noDiffs(),
        resolution: 'incoming',
      });
      continue;
    }
    const diffs = computeDiffs(localPair, inc);
    const kind = hasContentConflict(diffs) ? 'conflict' : 'identical';
    rows.push({
      key: `${kind}:${title}`,
      kind,
      title,
      local: localPair,
      incoming: inc,
      diffs,
      resolution: 'local',
    });
  }

  const order = {add: 0, conflict: 1, identical: 2} as const;
  rows.sort((a, b) => order[a.kind] - order[b.kind] || a.title.localeCompare(b.title));

  return {
    rows,
    adds: rows.filter(r => r.kind === 'add').length,
    conflicts: rows.filter(r => r.kind === 'conflict').length,
    identical: rows.filter(r => r.kind === 'identical').length,
  };
}

export function withResolution(plan: MergePlan, key: string, resolution: Resolution): MergePlan {
  return {
    ...plan,
    rows: plan.rows.map(r => (r.key === key && r.kind === 'conflict' ? {...r, resolution} : r)),
  };
}

export const resolvedIncomingCount = (plan: MergePlan) =>
  plan.rows.filter(r => r.kind === 'conflict' && r.resolution === 'incoming').length;

function applyIncoming(local: Pair, inc: IncomingItem): Pair {
  // 仅覆盖包携带的字段；size/weight/leading/tracking 维持本地排版。
  return {
    ...local,
    heading: inc.heading,
    body: inc.body,
    headingFont: inc.headingFont,
    bodyFont: inc.bodyFont,
    favorite: inc.favorite,
  };
}

/** 按计划落库；返回新列表与计数，调用方负责保存快照与持久化。 */
export function applyPlan(
  local: Pair[],
  plan: MergePlan,
  nextId: number,
): AppliedMerge {
  const byTitle = new Map(local.map(p => [p.title, p]));
  let id = nextId;
  let added = 0;
  let updated = 0;

  for (const row of plan.rows) {
    if (!row.incoming) continue;
    const inc = row.incoming;
    if (row.kind === 'add') {
      byTitle.set(inc.title, {
        id: id++,
        title: inc.title,
        heading: inc.heading,
        body: inc.body,
        category: 'Imported',
        favorite: inc.favorite,
        headingFont: inc.headingFont,
        bodyFont: inc.bodyFont,
        size: DEFAULT_TYPO.size,
        weight: DEFAULT_TYPO.weight,
        leading: DEFAULT_TYPO.leading,
        tracking: DEFAULT_TYPO.tracking,
      });
      added++;
    } else if (row.kind === 'conflict' && row.resolution === 'incoming') {
      const existing = byTitle.get(inc.title);
      if (existing) {
        byTitle.set(inc.title, applyIncoming(existing, inc));
        updated++;
      }
    }
    // identical 与 resolution=local 的冲突：本地记录原样保留。
  }

  // 保持本地原有顺序，新增项追加在末尾。
  const pairs: Pair[] = [];
  for (const p of local) {
    const cur = byTitle.get(p.title);
    if (cur) {
      pairs.push(cur);
      byTitle.delete(p.title);
    }
  }
  for (const p of byTitle.values()) pairs.push(p);

  return {
    pairs,
    nextId: id,
    result: {
      added,
      updated,
      unchanged: plan.rows.length - added - updated,
      favoritesAfter: pairs.filter(p => p.favorite).length,
    },
  };
}

// ---- 未保存调整守卫 ----

export interface PendingChanges {
  typo: boolean; // 字体或排版滑块有未落库改动
  /* 预留：其他编辑可在此扩展 */
}

export const hasPendingChanges = (c: PendingChanges) => c.typo;
