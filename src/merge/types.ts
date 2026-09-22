// Shared data model for the pairing package merge console.

export type Pair = {
  id: number;
  title: string;
  heading: string;
  body: string;
  category: string;
  favorite: boolean;
  headingFont: string;
  bodyFont: string;
};

// Workspace-wide typography draft; a difference between draft and saved
// counts as an unsaved adjustment that blocks the whole merge batch.
export type TypeSettings = {
  headingFont: string;
  bodyFont: string;
  size: number;
  weight: number;
  leading: number;
  tracking: number;
};

// One entry pasted inside a merge package.
export type IncomingItem = {
  title: string;
  heading: string;
  body: string;
  category: string;
  favorite: boolean;
  headingFont?: string;
  bodyFont?: string;
};

export type MergePackage = {
  name?: string;
  items: IncomingItem[];
};

// ---- Validation -----------------------------------------------------------

export type IssueSeverity = 'error' | 'warning';

export type ValidationIssue = {
  severity: IssueSeverity;
  index: number;
  message: string;
};

export type ValidationResult = {
  ok: boolean; // parseable + no errors (warnings are allowed)
  packageName: string;
  issues: ValidationIssue[];
  items: IncomingItem[]; // normalized items; empty when ok is false
  rawCount: number;
};

// ---- Merge rules ----------------------------------------------------------

export type DiffField = 'body' | 'headingFont' | 'bodyFont' | 'favorite';

export type ItemStatus = 'new' | 'identical' | 'conflict' | 'adjust';

export type FieldResolution = 'keep-local' | 'take-incoming';

// Favorite is a soft field: it never causes a conflict on its own.
export type ItemResolution = {
  body: FieldResolution;
  headingFont: FieldResolution;
  bodyFont: FieldResolution;
  favorite: FieldResolution;
};

export type ReviewItem = {
  key: string;
  status: ItemStatus;
  incoming: IncomingItem;
  local?: Pair;
  hardFields: DiffField[]; // conflicting hard fields (body / fonts)
  softFields: DiffField[]; // favorite
  resolution: ItemResolution;
};

export type MergePlan = {
  packageName: string;
  review: ReviewItem[];
};

export type ItemOutcome =
  | 'added'
  | 'skipped-identical'
  | 'updated-local'
  | 'kept-local'
  | 'mixed';

export type ProcessedItem = {
  key: string;
  title: string;
  status: ItemStatus;
  outcome: ItemOutcome;
  detail: string; // human-readable, zh-CN
};

export type MergeBatch = {
  id: string;
  at: number;
  packageName: string;
  added: number;
  updated: number;
  kept: number;
  skipped: number;
  processed: ProcessedItem[];
  snapshot: Pair[]; // pre-merge snapshot used by undo
};
