// Layer 1 — import validation.
// Parses pasted package text, normalizes entries and reports every issue
// before anything touches local records. Pure functions, no dependencies.

import type {
  IncomingItem,
  MergePackage,
  ValidationIssue,
  ValidationResult,
} from './types';

export const KNOWN_FONTS = [
  'Fraunces',
  'DM Sans',
  'Space Grotesk',
  'Newsreader',
  'IBM Plex Sans',
  'Playfair Display',
];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

function validateItem(
  raw: unknown,
  index: number,
  seenTitles: Map<string, number>,
  issues: ValidationIssue[],
): IncomingItem | null {
  if (!isRecord(raw)) {
    issues.push({
      severity: 'error',
      index,
      message: `第 ${index + 1} 项不是有效对象，已忽略`,
    });
    return null;
  }

  const {title, heading, body, category, favorite, headingFont, bodyFont} = raw;

  if (!isNonEmptyString(title)) {
    issues.push({severity: 'error', index, message: '缺少标题（title）'});
    return null;
  }
  const cleanTitle = title.trim();
  const firstAt = seenTitles.get(cleanTitle);
  if (firstAt === undefined) {
    seenTitles.set(cleanTitle, index);
  } else {
    issues.push({
      severity: 'error',
      index,
      message: `标题「${cleanTitle}」与第 ${firstAt + 1} 项重复，包内标题必须唯一`,
    });
    return null;
  }

  if (!isNonEmptyString(body)) {
    issues.push({
      severity: 'error',
      index,
      message: `「${cleanTitle}」缺少正文（body）`,
    });
    return null;
  }

  if (headingFont !== undefined && (typeof headingFont !== 'string' || !headingFont.trim())) {
    issues.push({
      severity: 'error',
      index,
      message: `「${cleanTitle}」的标题字体不是有效文字`,
    });
    return null;
  }
  if (bodyFont !== undefined && (typeof bodyFont !== 'string' || !bodyFont.trim())) {
    issues.push({
      severity: 'error',
      index,
      message: `「${cleanTitle}」的正文字体不是有效文字`,
    });
    return null;
  }

  // Soft problems: the batch can still proceed.
  if (heading !== undefined && (typeof heading !== 'string' || !heading.trim())) {
    issues.push({
      severity: 'warning',
      index,
      message: `「${cleanTitle}」的标题文字为空，将回退为标题`,
    });
  }
  if (typeof headingFont === 'string' && !KNOWN_FONTS.includes(headingFont.trim())) {
    issues.push({
      severity: 'warning',
      index,
      message: `「${cleanTitle}」的标题字体 ${headingFont} 不在内置字体清单中`,
    });
  }
  if (typeof bodyFont === 'string' && !KNOWN_FONTS.includes(bodyFont.trim())) {
    issues.push({
      severity: 'warning',
      index,
      message: `「${cleanTitle}」的正文字体 ${bodyFont} 不在内置字体清单中`,
    });
  }
  if (category !== undefined && (typeof category !== 'string' || !category.trim())) {
    issues.push({
      severity: 'warning',
      index,
      message: `「${cleanTitle}」的分类为空，将归类为 Imported`,
    });
  }
  if (favorite !== undefined && typeof favorite !== 'boolean') {
    issues.push({
      severity: 'warning',
      index,
      message: `「${cleanTitle}」的收藏标记不是布尔值，按未收藏处理`,
    });
  }

  return {
    title: cleanTitle,
    heading: typeof heading === 'string' && heading.trim() ? heading.trim() : cleanTitle,
    body: body.trim(),
    category:
      typeof category === 'string' && category.trim() ? category.trim() : 'Imported',
    favorite: favorite === true,
    headingFont: typeof headingFont === 'string' ? headingFont.trim() : undefined,
    bodyFont: typeof bodyFont === 'string' ? bodyFont.trim() : undefined,
  };
}

function extractPayload(data: unknown): {
  name: string;
  rawItems: unknown[];
  shapeIssues: ValidationIssue[];
} {
  const shapeIssues: ValidationIssue[] = [];

  // Shape A: {name?, items:[...]}
  if (isRecord(data) && Array.isArray((data as MergePackage).items)) {
    const name =
      typeof (data as MergePackage).name === 'string'
        ? ((data as MergePackage).name as string).trim()
        : '';
    return {name: name || '未命名配对包', rawItems: (data as MergePackage).items, shapeIssues};
  }

  // Shape B: bare array of items.
  if (Array.isArray(data)) {
    return {name: '未命名配对包', rawItems: data, shapeIssues};
  }

  return {name: '未命名配对包', rawItems: [], shapeIssues};
}

export function validatePackageText(text: string): ValidationResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      packageName: '',
      items: [],
      rawCount: 0,
      issues: [{severity: 'error', index: -1, message: '请先粘贴配对包内容（JSON）'}],
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      packageName: '',
      items: [],
      rawCount: 0,
      issues: [{severity: 'error', index: -1, message: '内容不是合法的 JSON，无法解析'}],
    };
  }

  const {name, rawItems, shapeIssues} = extractPayload(data);
  const issues = [...shapeIssues];

  if (rawItems.length === 0) {
    issues.push({severity: 'error', index: -1, message: '包内没有任何配对条目'});
  }

  const seenTitles = new Map<string, number>();
  const items: IncomingItem[] = [];
  rawItems.forEach((raw, index) => {
    const item = validateItem(raw, index, seenTitles, issues);
    if (item) items.push(item);
  });

  const hasError = issues.some(i => i.severity === 'error');
  return {
    ok: !hasError && items.length > 0,
    packageName: name,
    issues,
    items,
    rawCount: rawItems.length,
  };
}
