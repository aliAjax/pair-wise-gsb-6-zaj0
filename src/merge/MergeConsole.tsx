import {useMemo, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, FileJson, GitMerge, X} from 'lucide-react';
import {validatePack} from './validation';
import {
  applyPlan,
  buildPlan,
  resolvedIncomingCount,
  withResolution,
} from './merge';
import type {
  AppliedMerge,
  IncomingItem,
  MergeBatch,
  MergePlan,
  Pair,
  Resolution,
  RowIssue,
  ValidationReport,
} from './types';

type Stage = 'paste' | 'report' | 'review' | 'result';

interface Props {
  localPairs: Pair[];
  nextId: number;
  blocked: boolean; // 存在未保存的字体或排版调整
  onSaveTypo: () => void;
  onDiscardTypo: () => void;
  onClose: () => void;
  onApplied: (applied: AppliedMerge, batch: MergeBatch) => void;
}

const SAMPLE = JSON.stringify(
  {
    typePairerPack: 1,
    items: [
      {
        title: 'Editorial calm',
        heading: 'A quieter way to see',
        body: 'Good typography creates space for ideas to breathe. Pair a confident display face with a quiet, generous text face.',
        favorite: true,
        headingFont: 'Playfair Display',
        bodyFont: 'Newsreader',
      },
      {
        title: 'Studio notes',
        heading: 'Make room for the unexpected',
        body: 'A thoughtful pairing can add rhythm to even the simplest interface. Try contrast in shape, not just size.',
        favorite: false,
        headingFont: 'Fraunces',
        bodyFont: 'DM Sans',
      },
      {
        title: 'Field guide',
        heading: 'Small details, lasting impressions',
        body: 'Typography is the voice of a page. Find a combination that feels clear, warm and distinctly yours.',
        favorite: false,
        headingFont: 'Space Grotesk',
        bodyFont: 'IBM Plex Sans',
      },
      {title: 'Fresh import', heading: 'Brought in from another studio', body: 'Brand new titles are appended to the library with their favorite flag intact.', favorite: true, headingFont: 'Fraunces', bodyFont: 'DM Sans'},
    ],
  },
  null,
  2,
);

export default function MergeConsole({
  localPairs,
  nextId,
  blocked,
  onSaveTypo,
  onDiscardTypo,
  onClose,
  onApplied,
}: Props) {
  const [stage, setStage] = useState<Stage>('paste');
  const [text, setText] = useState('');
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [applied, setApplied] = useState<AppliedMerge | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const errorCount = useMemo(
    () =>
      (report?.rows ?? []).reduce(
        (n, r) => n + r.issues.filter(i => i.level === 'error').length,
        0,
      ) + (report?.issues.filter(i => i.level === 'error').length ?? 0),
    [report],
  );
  const warnCount = useMemo(
    () =>
      (report?.rows ?? []).reduce(
        (n, r) => n + r.issues.filter(i => i.level === 'warning').length,
        0,
      ) + (report?.issues.filter(i => i.level === 'warning').length ?? 0),
    [report],
  );

  const runValidate = () => {
    const r = validatePack(text);
    setReport(r);
    if (r.ok) {
      setPlan(buildPlan(localPairs, r.items));
      setStage('review');
    } else {
      setPlan(null);
      setStage('report');
    }
  };

  const readFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(f);
  };

  const choose = (key: string, resolution: Resolution) =>
    setPlan(p => (p ? withResolution(p, key, resolution) : p));

  const confirmMerge = () => {
    if (!plan || blocked) return;
    const snapshot = JSON.parse(JSON.stringify(localPairs)) as Pair[];
    const result = applyPlan(localPairs, plan, nextId);
    const batch: MergeBatch = {
      id: Date.now(),
      at: Date.now(),
      label: `导入 ${plan.rows.length} 项 · 新增 ${result.result.added} · 覆盖 ${result.result.updated}`,
      snapshot,
      nextIdBefore: nextId,
      result: result.result,
    };
    setApplied(result);
    onApplied(result, batch);
    setStage('result');
  };

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="merge-modal" onClick={e => e.stopPropagation()}>
        <div className="merge-head">
          <div>
            <span className="merge-kicker">
              <GitMerge size={13} /> MERGE BENCH
            </span>
            <h2>配对包合并台</h2>
          </div>
          <div className="merge-steps">
            {(['paste', 'review', 'result'] as Stage[]).map((s, i) => (
              <span
                key={s}
                className={
                  stage === s || (s === 'review' && stage === 'report')
                    ? 'step on'
                    : 'step'
                }
              >
                {i + 1} {s === 'paste' ? '粘贴校验' : s === 'review' ? '冲突预览' : '完成'}
              </span>
            ))}
          </div>
          <button className="merge-x" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {stage === 'paste' && (
          <div className="merge-body">
            <p className="merge-hint">
              粘贴包含标题、字体、正文与收藏标记的配对包（JSON）。先校验，再逐项预览；校验失败或存在未保存的排版调整时不会写入本地。
            </p>
            <textarea
              className="merge-input"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder='{"typePairerPack":1,"items":[{"title":...,"heading":...,"body":...,"favorite":false,"headingFont":"Fraunces","bodyFont":"DM Sans"}]}'
              spellCheck={false}
            />
            <div className="merge-row">
              <div className="merge-row-left">
                <button className="outline" onClick={() => fileRef.current?.click()}>
                  <FileJson size={14} /> 读取 .json 文件
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={e => readFile(e.target.files?.[0])}
                />
                <button className="link-btn" onClick={() => setText(SAMPLE)}>
                  填入示例包
                </button>
              </div>
              <button className="primary" disabled={!text.trim()} onClick={runValidate}>
                校验包内容
              </button>
            </div>
          </div>
        )}

        {stage === 'report' && report && (
          <div className="merge-body">
            <div className="verify-banner bad">
              <AlertTriangle size={16} />
              <div>
                <b>校验未通过（{errorCount} 个错误{warnCount > 0 ? `、${warnCount} 个警告` : ''}）</b>
                <span>存在错误的条目不会进入合并，请修正包内容后重新校验。</span>
              </div>
            </div>
            <IssueList report={report} />
            <div className="merge-row">
              <button className="outline" onClick={() => setStage('paste')}>
                返回修改
              </button>
            </div>
          </div>
        )}

        {stage === 'review' && plan && report && (
          <div className="merge-body">
            {blocked && (
              <div className="verify-banner block">
                <AlertTriangle size={16} />
                <div className="grow">
                  <b>检测到未保存的字体或排版调整，整批合并已被阻止</b>
                  <span>先处理画布上的调整，再确认合并，本地记录不会被半途覆盖。</span>
                </div>
                <button className="outline" onClick={onSaveTypo}>
                  保存调整
                </button>
                <button className="link-btn danger" onClick={onDiscardTypo}>
                  放弃调整
                </button>
              </div>
            )}
            {warnCount > 0 && (
              <details className="warn-details">
                <summary>
                  <AlertTriangle size={13} /> 校验通过，但有 {warnCount} 个警告（点击展开）
                </summary>
                <IssueList report={report} errorsOnly={false} />
              </details>
            )}
            <div className="plan-summary">
              <span className="tag add">新增 {plan.adds}</span>
              <span className="tag conflict">冲突 {plan.conflicts}</span>
              <span className="tag same">一致 {plan.identical}</span>
              <span className="plan-note">
                冲突默认保留本地；将使用包内版本覆盖 {resolvedIncomingCount(plan)} 项。
              </span>
            </div>
            <div className="plan-list">
              {plan.rows.map(row => (
                <PlanRow key={row.key} row={row} onChoose={choose} />
              ))}
            </div>
            <div className="merge-row">
              <button className="outline" onClick={() => setStage('paste')}>
                返回
              </button>
              <button className="primary" disabled={blocked} onClick={confirmMerge}>
                <CheckCircle2 size={14} /> 确认合并（{plan.rows.length} 项）
              </button>
            </div>
          </div>
        )}

        {stage === 'result' && applied && plan && (
          <div className="merge-body">
            <div className="verify-banner good">
              <CheckCircle2 size={16} />
              <div>
                <b>合并完成，已生成为可撤销批次</b>
                <span>关闭后可在底部提示条中一键撤销，恢复合并前快照。</span>
              </div>
            </div>
            <div className="result-grid">
              <div><b>{applied.result.added}</b><span>新增配对</span></div>
              <div><b>{applied.result.updated}</b><span>按包内版本覆盖</span></div>
              <div><b>{applied.result.unchanged}</b><span>保留本地未动</span></div>
              <div><b>{applied.result.favoritesAfter}</b><span>当前收藏总数</span></div>
            </div>
            <div className="merge-row">
              <button className="primary" onClick={onClose}>
                完成
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IssueList({report, errorsOnly = true}: {report: ValidationReport; errorsOnly?: boolean}) {
  const packIssues = report.issues.filter(i => !errorsOnly || i.level === 'error');
  return (
    <div className="issue-list">
      {packIssues.map((i, n) => (
        <IssuePill key={`p${n}`} issue={i} />
      ))}
      {report.rows.map(r =>
        r.issues
          .filter(i => !errorsOnly || i.level === 'error')
          .map((i, n) => (
            <IssuePill key={`${r.index}-${n}`} issue={i} index={r.index} />
          )),
      )}
    </div>
  );
}

function IssuePill({issue, index}: {issue: RowIssue; index?: number}) {
  return (
    <div className={`issue ${issue.level}`}>
      <span>{issue.level === 'error' ? '错误' : '警告'}</span>
      {index !== undefined ? <b>第 {index + 1} 条：</b> : <b>包：</b>}
      {issue.message}
    </div>
  );
}

function PlanRow({
  row,
  onChoose,
}: {
  row: MergePlan['rows'][number];
  onChoose: (key: string, r: Resolution) => void;
}) {
  const inc: IncomingItem | null = row.incoming;
  return (
    <div className={`plan-row ${row.kind}`}>
      <div className="plan-row-head">
        <span className={`plan-badge ${row.kind}`}>
          {row.kind === 'add' ? '新增' : row.kind === 'conflict' ? '冲突' : '一致'}
        </span>
        <b>{row.title}</b>
        {inc?.favorite && <span className="fav-flag">♥ 包内已收藏</span>}
      </div>

      {row.kind === 'add' && inc && (
        <>
          <FieldPreview inc={inc} />
          <div className="plan-result ok">处理结果：作为新配对追加到列表，收藏计数随之{(inc.favorite ? '+1' : '不变')}。</div>
        </>
      )}

      {row.kind === 'identical' && (
        <div className="plan-result">
          处理结果：标题、字体与正文完全一致，本地记录保持不变
          {row.diffs.favorite && '（含本地收藏状态，包内不同的收藏标记被忽略）'}。
        </div>
      )}

      {row.kind === 'conflict' && row.local && inc && (
        <>
          <div className="diff-grid">
            <DiffCell label="展示标题" local={row.local.heading} incoming={inc.heading} hit={row.diffs.heading} />
            <DiffCell label="标题字体" local={row.local.headingFont} incoming={inc.headingFont} hit={row.diffs.headingFont} mono />
            <DiffCell label="正文字体" local={row.local.bodyFont} incoming={inc.bodyFont} hit={row.diffs.bodyFont} mono />
            <DiffCell label="正文" local={row.local.body} incoming={inc.body} hit={row.diffs.body} />
            <DiffCell
              label="收藏"
              local={row.local.favorite ? '已收藏' : '未收藏'}
              incoming={inc.favorite ? '已收藏' : '未收藏'}
              hit={row.diffs.favorite}
            />
          </div>
          <div className="resolve-row">
            <button
              className={row.resolution === 'local' ? 'pick on local' : 'pick'}
              onClick={() => onChoose(row.key, 'local')}
            >
              保留本地
            </button>
            <button
              className={row.resolution === 'incoming' ? 'pick on incoming' : 'pick'}
              onClick={() => onChoose(row.key, 'incoming')}
            >
              使用包内版本
            </button>
            <span className={`plan-result ${row.resolution === 'incoming' ? 'warn' : ''}`}>
              {row.resolution === 'local'
                ? '处理结果：本地记录不被覆盖，忽略包内版本。'
                : '处理结果：以包内版本覆盖此项，含收藏状态。'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function FieldPreview({inc}: {inc: IncomingItem}) {
  return (
    <div className="field-preview">
      <strong>{inc.heading}</strong>
      <p>{inc.body}</p>
      <span className="font-chip">{inc.headingFont}</span>
      <span className="font-chip">{inc.bodyFont}</span>
    </div>
  );
}

function DiffCell({
  label,
  local,
  incoming,
  hit,
  mono,
}: {
  label: string;
  local: string;
  incoming: string;
  hit: boolean;
  mono?: boolean;
}) {
  return (
    <div className={`diff-cell ${hit ? 'hit' : ''}`}>
      <span className="diff-label">
        {label} {hit && <i>不一致</i>}
      </span>
      <div className="diff-vals">
        <div><em>本地</em><p className={mono ? 'mono' : ''}>{local}</p></div>
        <div><em>包内</em><p className={mono ? 'mono' : ''}>{incoming}</p></div>
      </div>
    </div>
  );
}

