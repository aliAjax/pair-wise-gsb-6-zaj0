// 导入校验：与界面、合并规则完全分开。
// 支持两种包格式：
//   1) {"typePairerPack":1,"items":[...]}
//   2) 直接传入条目数组
// 每条必须含非空的 title / heading / body；字体字段缺省时给警告并回退默认字体；
// favorite 缺省按 false 处理（警告）。任一条 error 整包拒绝（界面阻止进入合并）。

import type {IncomingItem, RowIssue, ValidationReport, ValidatedRow} from './types';

export const DEFAULT_HEADING_FONT = 'Fraunces';
export const DEFAULT_BODY_FONT = 'DM Sans';
const MAX_LEN = 5000;

const isStr = (v: unknown): v is string => typeof v === 'string';
const nonEmpty = (v: unknown): v is string => isStr(v) && v.trim().length > 0;

function error(message: string): RowIssue {
  return {level: 'error', message};
}
function warning(message: string): RowIssue {
  return {level: 'warning', message};
}

/** 校验已解析的 JSON 值（或字符串），不触碰存储、不感知 React */
export function validatePack(input: unknown): ValidationReport {
  const report: ValidationReport = {ok: false, issues: [], rows: [], items: []};

  let data: unknown = input;
  if (isStr(input)) {
    try {
      data = JSON.parse(input);
    } catch {
      report.issues.push(error('包内容不是有效的 JSON，请检查后重新粘贴。'));
      return report;
    }
  }

  let list: unknown = data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if ('items' in obj) {
      if ('typePairerPack' in obj && obj.typePairerPack !== 1) {
        report.issues.push(warning(`包版本为 ${String(obj.typePairerPack)}，按 v1 规则尝试读取。`));
      }
      list = obj.items;
    }
  }

  if (!Array.isArray(list)) {
    report.issues.push(error('包内未找到条目数组（需要 items 字段或直接提供数组）。'));
    return report;
  }
  if (list.length === 0) {
    report.issues.push(error('包内没有任何配对，无法合并。'));
    return report;
  }

  const items: IncomingItem[] = [];
  const seenTitles = new Map<string, number>();

  list.forEach((raw, index) => {
    const row: ValidatedRow = {index, raw, item: null, issues: []};

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      row.issues.push(error('该条目不是对象，已跳过。'));
      report.rows.push(row);
      return;
    }
    const o = raw as Record<string, unknown>;

    if (!nonEmpty(o.title)) row.issues.push(error('缺少标题（title）。'));
    else if (o.title.trim().length > 120) row.issues.push(error('标题超过 120 字。'));
    if (!nonEmpty(o.heading)) row.issues.push(error('缺少字体展示标题（heading）。'));
    if (!nonEmpty(o.body)) row.issues.push(error('缺少正文（body）。'));

    for (const [k, v] of [['heading', o.heading], ['body', o.body]] as const) {
      if (nonEmpty(v) && v.length > MAX_LEN) {
        row.issues.push(error(`${k === 'heading' ? '展示标题' : '正文'}超过 ${MAX_LEN} 字。`));
      }
    }

    let headingFont: string;
    let bodyFont: string;
    if (isStr(o.headingFont) && o.headingFont.trim()) {
      headingFont = o.headingFont.trim();
    } else {
      headingFont = DEFAULT_HEADING_FONT;
      row.issues.push(warning(`未提供标题字体，按 ${DEFAULT_HEADING_FONT} 处理。`));
    }
    if (isStr(o.bodyFont) && o.bodyFont.trim()) {
      bodyFont = o.bodyFont.trim();
    } else {
      bodyFont = DEFAULT_BODY_FONT;
      row.issues.push(warning(`未提供正文字体，按 ${DEFAULT_BODY_FONT} 处理。`));
    }

    let favorite = false;
    if (typeof o.favorite === 'boolean') {
      favorite = o.favorite;
    } else if (o.favorite === undefined) {
      row.issues.push(warning('未标记收藏，按未收藏处理。'));
    } else {
      row.issues.push(warning('收藏标记不是布尔值，按未收藏处理。'));
    }

    const title = nonEmpty(o.title) ? o.title.trim() : '';
    if (title) {
      const dup = seenTitles.get(title);
      if (dup !== undefined) {
        row.issues.push(warning(`与包内第 ${dup + 1} 条标题相同，只会保留其中一条。`));
      } else {
        seenTitles.set(title, index);
      }
    }

    report.rows.push(row);

    if (!row.issues.some(i => i.level === 'error')) {
      row.item = {
        title,
        heading: (o.heading as string).trim(),
        body: (o.body as string).trim(),
        favorite,
        headingFont,
        bodyFont,
      };
      items.push(row.item);
    }
  });

  const errorCount = report.rows.reduce(
    (n, r) => n + r.issues.filter(i => i.level === 'error').length,
    0,
  );
  report.ok = errorCount === 0 && report.issues.every(i => i.level !== 'error');
  report.items = report.ok ? items : [];
  return report;
}
