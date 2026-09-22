// 配对与合并台共用的领域类型，界面与规则模块都不依赖 React。

export interface Pair {
  id: number;
  title: string;
  heading: string;
  body: string;
  category: string;
  favorite: boolean;
  headingFont: string;
  bodyFont: string;
  size: number;
  weight: number;
  leading: number;
  tracking: number;
}

/** 排版字段（合并台只关心字体与正文，但整组字段一起存取） */
export type TypoDraft = Pick<
  Pair,
  'headingFont' | 'bodyFont' | 'size' | 'weight' | 'leading' | 'tracking'
>;

/** 导入包内单条配对（外部数据，字段未知，需经校验） */
export interface IncomingItem {
  title: string;
  heading: string;
  body: string;
  favorite: boolean;
  headingFont: string;
  bodyFont: string;
}

// ---- 导入校验 ----

export type IssueLevel = 'error' | 'warning';

export interface RowIssue {
  level: IssueLevel;
  message: string;
}

export interface ValidatedRow {
  index: number;
  raw: unknown;
  item: IncomingItem | null;
  issues: RowIssue[];
}

export interface ValidationReport {
  ok: boolean;
  issues: RowIssue[]; // 包级问题（解析失败、缺条目等）
  rows: ValidatedRow[];
  items: IncomingItem[]; // 仅当 ok 为 true 时可用
}

// ---- 合并规则 ----

export type ChangeKind = 'add' | 'identical' | 'conflict';

/** 冲突字段标记，用于界面上高亮差异 */
export interface FieldDiffs {
  heading: boolean;
  headingFont: boolean;
  bodyFont: boolean;
  body: boolean;
  favorite: boolean;
}

export type Resolution = 'local' | 'incoming';

export interface MergeRow {
  key: string;
  kind: ChangeKind;
  title: string;
  local: Pair | null;
  incoming: IncomingItem | null;
  diffs: FieldDiffs;
  resolution: Resolution; // conflict 默认 local；add 恒为 incoming
}

export interface MergePlan {
  rows: MergeRow[];
  adds: number;
  conflicts: number;
  identical: number;
}

export interface MergeResultCounts {
  added: number;
  updated: number;
  unchanged: number;
  favoritesAfter: number;
}

/** 一次已提交、可撤销的批次 */
export interface MergeBatch {
  id: number;
  at: number;
  label: string;
  snapshot: Pair[]; // 合并前快照，撤销即恢复
  nextIdBefore: number;
  result: MergeResultCounts;
}

export interface AppliedMerge {
  pairs: Pair[];
  nextId: number;
  result: MergeResultCounts;
}
