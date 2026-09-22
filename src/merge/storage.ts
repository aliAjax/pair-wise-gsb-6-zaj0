// 本地存储：配对库与可撤销批次的唯一出入口。
// 规则模块不直接读写 localStorage，全部经由这里。

import {DEFAULT_TYPO} from './merge';
import type {MergeBatch, Pair} from './types';

const PAIRS_KEY = 'type-pairs';
const BATCHES_KEY = 'type-pairer-merge-batches';

export function migratePair(raw: Record<string, unknown>): Pair {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
  return {
    id: num(raw.id, Date.now()),
    title: str(raw.title, 'Untitled'),
    heading: str(raw.heading, ''),
    body: str(raw.body, ''),
    category: str(raw.category, 'Untitled'),
    favorite: Boolean(raw.favorite),
    headingFont: str(raw.headingFont, DEFAULT_TYPO.headingFont),
    bodyFont: str(raw.bodyFont, DEFAULT_TYPO.bodyFont),
    size: num(raw.size, DEFAULT_TYPO.size),
    weight: num(raw.weight, DEFAULT_TYPO.weight),
    leading: num(raw.leading, DEFAULT_TYPO.leading),
    tracking: num(raw.tracking, DEFAULT_TYPO.tracking),
  };
}

export function loadPairs(fallback: Pair[]): Pair[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PAIRS_KEY) || '');
    if (!Array.isArray(raw) || raw.length === 0) return fallback;
    return raw.map((r: unknown) => migratePair((r ?? {}) as Record<string, unknown>));
  } catch {
    return fallback;
  }
}

export function savePairs(pairs: Pair[]): void {
  localStorage.setItem(PAIRS_KEY, JSON.stringify(pairs));
}

export function loadBatches(): MergeBatch[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BATCHES_KEY) || '[]');
    return Array.isArray(raw) ? (raw as MergeBatch[]) : [];
  } catch {
    return [];
  }
}

export function saveBatch(batch: MergeBatch): MergeBatch[] {
  // 仅保留最近 5 个批次，撤销入口只暴露最近一个。
  const batches = [batch, ...loadBatches()].slice(0, 5);
  localStorage.setItem(BATCHES_KEY, JSON.stringify(batches));
  return batches;
}

export function dropBatch(id: number): MergeBatch[] {
  const batches = loadBatches().filter(b => b.id !== id);
  localStorage.setItem(BATCHES_KEY, JSON.stringify(batches));
  return batches;
}
