// Layer 2 — merge rules.
// Diffing, per-item resolution, batch application with an undo snapshot,
// and batch-history persistence. Pure logic plus localStorage access;
// nothing here renders UI.

import type {
  DiffField,
  FieldResolution,
  IncomingItem,
  ItemOutcome,
  ItemResolution,
  ItemStatus,
  MergeBatch,
  MergePlan,
  Pair,
  ProcessedItem,
  ReviewItem,
  TypeSettings,
  ValidationResult,
} from './types';

const HARD_FIELDS: DiffField[] = ['body', 'headingFont', 'bodyFont'];
export const FIELD_LABELS: Record<DiffField, string> = {
  body: '正文',
  headingFont: '标题字体',
  bodyFont: '正文字体',
  favorite: '收藏',
};

const KEEP_LOCAL: ItemResolution = {
  body: 'keep-local',
  headingFont: 'keep-local',
  bodyFont: 'keep-local',
  favorite: 'keep-local',
};

const TAKE_INCOMING: ItemResolution = {
  body: 'take-incoming',
  headingFont: 'take-incoming',
  bodyFont: 'take-incoming',
  favorite: 'take-incoming',
};

const SOFT_TAKE: ItemResolution = {...KEEP_LOCAL, favorite: 'take-incoming'};

// Fonts are optional in a package: missing font means "do not touch".
const incomingHeadingFont = (item: IncomingItem, fallback: string) =>
  item.headingFont ?? fallback;
const incomingBodyFont = (item: IncomingItem, fallback: string) =>
  item.bodyFont ?? fallback;

export function settingsEqual(a: TypeSettings, b: TypeSettings): boolean {
  return (
    a.headingFont === b.headingFont &&
    a.bodyFont === b.bodyFont &&
    a.size === b.size &&
    a.weight === b.weight &&
    a.leading === b.leading &&
    a.tracking === b.tracking
  );
}

function diffFields(
  local: Pair,
  incoming: IncomingItem,
  fallback: TypeSettings,
): {hard: DiffField[]; soft: DiffField[]} {
  const hard: DiffField[] = [];
  const soft: DiffField[] = [];
  if (local.body !== incoming.body) hard.push('body');
  if (
    incoming.headingFont !== undefined &&
    local.headingFont !== incomingHeadingFont(incoming, fallback.headingFont)
  ) {
    hard.push('headingFont');
  }
  if (
    incoming.bodyFont !== undefined &&
    local.bodyFont !== incomingBodyFont(incoming, fallback.bodyFont)
  ) {
    hard.push('bodyFont');
  }
  if (local.favorite !== incoming.favorite) soft.push('favorite');
  return {hard, soft};
}

// Build the review plan from validated items. Local records are never
// overwritten by the plan itself — every differing field defaults to
// keep-local and the preview has to opt in explicitly.
export function buildMergePlan(
  result: ValidationResult,
  locals: Pair[],
  fallback: TypeSettings,
): MergePlan {
  const byTitle = new Map(locals.map(p => [p.title, p]));
  const review: ReviewItem[] = result.items.map((incoming, i) => {
    const local = byTitle.get(incoming.title);
    const key = `${i}:${incoming.title}`;
    if (!local) {
      return {
        key,
        status: 'new',
        incoming,
        hardFields: [],
        softFields: [],
        resolution: TAKE_INCOMING,
      };
    }
    const {hard, soft} = diffFields(local, incoming, fallback);
    if (hard.length === 0 && soft.length === 0) {
      return {
        key,
        status: 'identical',
        incoming,
        local,
        hardFields: [],
        softFields: [],
        resolution: KEEP_LOCAL,
      };
    }
    if (hard.length > 0) {
      return {
        key,
        status: 'conflict',
        incoming,
        local,
        hardFields: hard,
        softFields: soft,
        resolution: KEEP_LOCAL, // safety default: local wins
      };
    }
    // Only favorite differs — soft update, incoming by default, still opt-out.
    return {
      key,
      status: 'adjust',
      incoming,
      local,
      hardFields: [],
      softFields: soft,
      resolution: SOFT_TAKE,
    };
  });
  return {packageName: result.packageName, review};
}

export function setFieldResolution(
  plan: MergePlan,
  key: string,
  field: DiffField,
  value: FieldResolution,
): MergePlan {
  return {
    ...plan,
    review: plan.review.map(r =>
      r.key === key ? {...r, resolution: {...r.resolution, [field]: value}} : r,
    ),
  };
}

// Apply one resolution choice to every differing field of a row at once.
export function setRowSide(
  plan: MergePlan,
  key: string,
  side: FieldResolution,
): MergePlan {
  return {
    ...plan,
    review: plan.review.map(r => {
      if (r.key !== key) return r;
      const fields = [...r.hardFields, ...r.softFields];
      const resolution = {...r.resolution};
      fields.forEach(f => {
        resolution[f] = side;
      });
      return {...r, resolution};
    }),
  };
}

function nextId(locals: Pair[]): number {
  return locals.reduce((max, p) => Math.max(max, p.id), 0) + 1;
}

function describeOutcome(
  status: ItemStatus,
  changed: DiffField[],
  incomingTakes: DiffField[],
): {outcome: ItemOutcome; detail: string} {
  if (status === 'new') return {outcome: 'added', detail: '作为新配对加入列表'};
  if (status === 'identical') {
    return {outcome: 'skipped-identical', detail: '与本地完全一致，跳过'};
  }
  const differing = [...(changed as DiffField[])];
  const kept = differing.filter(f => !incomingTakes.includes(f));
  if (incomingTakes.length === 0) {
    return {
      outcome: 'kept-local',
      detail: `保留本地：${differing.map(f => FIELD_LABELS[f]).join('、')}`,
    };
  }
  if (kept.length === 0) {
    return {
      outcome: 'updated-local',
      detail: `采用包内：${incomingTakes.map(f => FIELD_LABELS[f]).join('、')}`,
    };
  }
  return {
    outcome: 'mixed',
    detail: `采用包内 ${incomingTakes
      .map(f => FIELD_LABELS[f])
      .join('、')}；保留本地 ${kept.map(f => FIELD_LABELS[f]).join('、')}`,
  };
}

type Applied = {pairs: Pair[]; processed: ProcessedItem[]};

function applyPlan(
  locals: Pair[],
  plan: MergePlan,
  fallback: TypeSettings,
): Applied {
  let pairs = locals.map(p => ({...p}));
  const processed: ProcessedItem[] = [];

  for (const row of plan.review) {
    const {status, incoming, local, resolution, hardFields, softFields} = row;
    const changed = [...hardFields, ...softFields];
    const incomingTakes = changed.filter(f => resolution[f] === 'take-incoming');

    if (status === 'new') {
      pairs.push({
        id: nextId(pairs),
        title: incoming.title,
        heading: incoming.heading,
        body: incoming.body,
        category: incoming.category,
        favorite: incoming.favorite,
        headingFont: incomingHeadingFont(incoming, fallback.headingFont),
        bodyFont: incomingBodyFont(incoming, fallback.bodyFont),
      });
    } else if (status !== 'identical' && local) {
      pairs = pairs.map(p => {
        if (p.id !== local.id) return p;
        const next = {...p};
        // Heading text is preserved locally: pasted packages never
        // overwrite a local headline — body/fonts/favorite are the contract.
        if (resolution.body === 'take-incoming') next.body = incoming.body;
        if (
          resolution.headingFont === 'take-incoming' &&
          incoming.headingFont !== undefined
        ) {
          next.headingFont = incoming.headingFont;
        }
        if (
          resolution.bodyFont === 'take-incoming' &&
          incoming.bodyFont !== undefined
        ) {
          next.bodyFont = incoming.bodyFont;
        }
        if (resolution.favorite === 'take-incoming') next.favorite = incoming.favorite;
        return next;
      });
    }

    const {outcome, detail} = describeOutcome(status, changed, incomingTakes);
    processed.push({key: row.key, title: incoming.title, status, outcome, detail});
  }

  return {pairs, processed};
}

export function commitMerge(
  locals: Pair[],
  plan: MergePlan,
  fallback: TypeSettings,
): {pairs: Pair[]; batch: MergeBatch} {
  const snapshot = locals.map(p => ({...p}));
  const {pairs, processed} = applyPlan(locals, plan, fallback);
  const batch: MergeBatch = {
    id: `batch-${Date.now()}`,
    at: Date.now(),
    packageName: plan.packageName,
    added: processed.filter(p => p.outcome === 'added').length,
    updated: processed.filter(p => p.outcome === 'updated-local').length,
    kept: processed.filter(p => p.outcome === 'kept-local').length,
    skipped: processed.filter(p => p.outcome === 'skipped-identical').length,
    processed,
    snapshot,
  };
  return {pairs, batch};
}

export function undoBatch(batch: MergeBatch): Pair[] {
  // Restore the exact pre-merge snapshot: counts, list and storage all
  // realign through the single pairs state.
  return batch.snapshot.map(p => ({...p}));
}

// ---- Batch history (localStorage) -----------------------------------------

const HISTORY_KEY = 'type-merge-batches';
const HISTORY_LIMIT = 8;

export function loadBatches(): MergeBatch[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as MergeBatch[]) : [];
  } catch {
    return [];
  }
}

export function saveBatch(batch: MergeBatch): MergeBatch[] {
  const batches = [batch, ...loadBatches()].slice(0, HISTORY_LIMIT);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(batches));
  } catch {
    // Storage may be unavailable (private mode); the in-memory batch still
    // supports undo during this session.
  }
  return batches;
}

export function dropBatch(id: string): MergeBatch[] {
  const batches = loadBatches().filter(b => b.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(batches));
  } catch {
    // ignore
  }
  return batches;
}
