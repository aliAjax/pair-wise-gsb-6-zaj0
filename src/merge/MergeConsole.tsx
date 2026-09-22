// Layer 3 — merge console UI.
// Paste → validate → per-item preview/resolution → commit → result/undo.
// All logic lives in ./validation and ./rules; this file only renders.

import {useMemo, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ClipboardPaste,
  History,
  Merge as MergeIcon,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';
import {validatePackageText} from './validation';
import {
  buildMergePlan,
  commitMerge,
  FIELD_LABELS,
  setFieldResolution,
  setRowSide,
  undoBatch,
} from './rules';
import type {
  DiffField,
  FieldResolution,
  MergeBatch,
  MergePlan,
  Pair,
  TypeSettings,
  ValidationResult,
} from './types';

type Stage = 'input' | 'review' | 'result';

type Props = {
  pairs: Pair[];
  settings: TypeSettings; // saved settings (font fallback for new pairs)
  dirty: boolean; // unsaved font / typography adjustments
  batches: MergeBatch[];
  onCommit: (pairs: Pair[], batch: MergeBatch) => void;
  onUndo: (pairs: Pair[], batchId: string) => void;
  onSaveSettings: () => void;
  onDiscardSettings: () => void;
  onClose: () => void;
};

const STATUS_TAG: Record<string, {label: string; cls: string}> = {
  new: {label: '新增', cls: 'tag-new'},
  identical: {label: '一致', cls: 'tag-identical'},
  conflict: {label: '冲突', cls: 'tag-conflict'},
  adjust: {label: '收藏更新', cls: 'tag-adjust'},
};

const OUTCOME_TAG: Record<string, {label: string; cls: string}> = {
  added: {label: '已加入', cls: 'tag-new'},
  'skipped-identical': {label: '已跳过', cls: 'tag-identical'},
  'updated-local': {label: '已采用包内', cls: 'tag-take'},
  'kept-local': {label: '保留本地', cls: 'tag-keep'},
  mixed: {label: '逐项处理', cls: 'tag-adjust'},
};

export default function MergeConsole(props: Props) {
  const {pairs, settings, dirty, batches} = props;
  const [stage, setStage] = useState<Stage>('input');
  const [text, setText] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [lastBatch, setLastBatch] = useState<MergeBatch | null>(null);
  const [lastPairs, setLastPairs] = useState<Pair[] | null>(null);

  const counts = useMemo(() => {
    if (!plan) return null;
    return {
      new: plan.review.filter(r => r.status === 'new').length,
      conflict: plan.review.filter(r => r.status === 'conflict').length,
      adjust: plan.review.filter(r => r.status === 'adjust').length,
      identical: plan.review.filter(r => r.status === 'identical').length,
    };
  }, [plan]);

  const runValidation = () => {
    const result = validatePackageText(text);
    setValidation(result);
    if (result.ok) {
      setPlan(buildMergePlan(result, pairs, settings));
      setStage('review');
    } else {
      setPlan(null);
    }
  };

  const changeField = (key: string, field: DiffField, value: FieldResolution) => {
    setPlan(prev => (prev ? setFieldResolution(prev, key, field, value) : prev));
  };
  const changeRowSide = (key: string, side: FieldResolution) => {
    setPlan(prev => (prev ? setRowSide(prev, key, side) : prev));
  };

  const confirm = () => {
    if (!plan || dirty) return; // batch-wide block
    const {pairs: nextPairs, batch} = commitMerge(pairs, plan, settings);
    setLastBatch(batch);
    setLastPairs(nextPairs);
    props.onCommit(nextPairs, batch);
    setStage('result');
  };

  const undo = (batch: MergeBatch) => {
    const restored = undoBatch(batch);
    props.onUndo(restored, batch.id);
    if (lastBatch?.id === batch.id) {
      setLastBatch(null);
      setLastPairs(null);
    }
  };

  const restart = () => {
    setText('');
    setValidation(null);
    setPlan(null);
    setLastBatch(null);
    setLastPairs(null);
    setStage('input');
  };

  return (
    <div className="backdrop merge-backdrop" onClick={props.onClose}>
      <div className="merge-modal" onClick={e => e.stopPropagation()}>
        <div className="merge-head">
          <div>
            <span className="merge-eyebrow">
              <MergeIcon size={12} /> PAIRING PACKAGE MERGE
            </span>
            <h2>配对包合并台</h2>
          </div>
          <button className="icon-btn" onClick={props.onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="merge-steps">
          <span className={stage === 'input' ? 'step on' : 'step'}>1 · 粘贴校验</span>
          <span className="step-line" />
          <span className={stage === 'review' ? 'step on' : 'step'}>2 · 逐项预览</span>
          <span className="step-line" />
          <span className={stage === 'result' ? 'step on' : 'step'}>3 · 处理结果</span>
        </div>

        {stage === 'input' && (
          <InputStage
            text={text}
            setText={setText}
            validation={validation}
            batches={batches}
            onValidate={runValidation}
            onUndo={undo}
          />
        )}

        {stage === 'review' && validation && plan && counts && (
          <ReviewStage
            validation={validation}
            plan={plan}
            counts={counts}
            settings={settings}
            dirty={dirty}
            onField={changeField}
            onRowSide={changeRowSide}
            onBack={restart}
            onConfirm={confirm}
            onSaveSettings={props.onSaveSettings}
            onDiscardSettings={props.onDiscardSettings}
          />
        )}

        {stage === 'result' && lastBatch && lastPairs && (
          <ResultStage
            batch={lastBatch}
            pairsAfter={lastPairs}
            onUndo={() => undo(lastBatch)}
            onRestart={restart}
            onClose={props.onClose}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function InputStage({
  text,
  setText,
  validation,
  batches,
  onValidate,
  onUndo,
}: {
  text: string;
  setText: (v: string) => void;
  validation: ValidationResult | null;
  batches: MergeBatch[];
  onValidate: () => void;
  onUndo: (b: MergeBatch) => void;
}) {
  return (
    <div className="merge-body">
      <p className="merge-hint">
        粘贴配对包（标题、标题字体、正文字体、正文与收藏）。先校验，再合并；本地记录不会被静默覆盖。
      </p>
      <textarea
        className="merge-textarea"
        placeholder={'{\n  "name": "十月配对包",\n  "items": [\n    {\n      "title": "Editorial calm",\n      "headingFont": "Fraunces",\n      "bodyFont": "DM Sans",\n      "body": "…",\n      "favorite": true\n    }\n  ]\n}'}
        value={text}
        onChange={e => setText(e.target.value)}
        spellCheck={false}
      />

      {validation && validation.issues.length > 0 && (
        <div className="issue-list">
          {validation.issues.map((issue, i) => (
            <div key={i} className={`issue ${issue.severity}`}>
              {issue.severity === 'error' ? (
                <CircleAlert size={14} />
              ) : (
                <AlertTriangle size={14} />
              )}
              <span>
                {issue.index >= 0 ? `第 ${issue.index + 1} 项 · ` : ''}
                {issue.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {validation?.ok && (
        <div className="issue ok">
          <CheckCircle2 size={14} />
          <span>
            校验通过：「{validation.packageName}」共 {validation.items.length} 项可进入预览
            {validation.issues.some(i => i.severity === 'warning') ? '（含警告，已按回退规则处理）' : ''}
          </span>
        </div>
      )}

      <div className="merge-actions">
        <button className="outline" onClick={() => setText('')}>
          清空
        </button>
        <button className="primary" onClick={onValidate}>
          <ClipboardPaste size={15} /> 校验并预览
        </button>
      </div>

      {batches.length > 0 && (
        <div className="history">
          <div className="history-head">
            <History size={13} /> 可撤销的合并批次
          </div>
          {batches.map((b, i) => (
            <div key={b.id} className="history-row">
              <div>
                <b>{b.packageName}</b>
                <span>
                  {new Date(b.at).toLocaleString('zh-CN', {hour12: false})} · 加入 {b.added} ·
                  更新 {b.updated} · 保留 {b.kept} · 跳过 {b.skipped}
                </span>
              </div>
              {i === 0 ? (
                <button className="ghost-btn" onClick={() => onUndo(b)}>
                  <Undo2 size={13} /> 撤销恢复
                </button>
              ) : (
                <small className="history-locked">仅最近批次可撤销</small>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Older persisted batches keep their snapshot but undo is exposed for the
// latest batch only, so the action label stays honest.

// ---------------------------------------------------------------------------

function ReviewStage({
  validation,
  plan,
  counts,
  settings,
  dirty,
  onField,
  onRowSide,
  onBack,
  onConfirm,
  onSaveSettings,
  onDiscardSettings,
}: {
  validation: ValidationResult;
  plan: MergePlan;
  counts: {new: number; conflict: number; adjust: number; identical: number};
  settings: TypeSettings;
  dirty: boolean;
  onField: (key: string, field: DiffField, value: FieldResolution) => void;
  onRowSide: (key: string, side: FieldResolution) => void;
  onBack: () => void;
  onConfirm: () => void;
  onSaveSettings: () => void;
  onDiscardSettings: () => void;
}) {
  return (
    <div className="merge-body">
      <div className="review-summary">
        <div className="review-pkg">
          <ShieldCheck size={15} />
          <div>
            <b>{plan.packageName}</b>
            <span>
              校验 {validation.items.length} 项 · 新增 {counts.new} · 冲突 {counts.conflict} ·
              收藏更新 {counts.adjust} · 一致 {counts.identical}
            </span>
          </div>
        </div>
      </div>

      {dirty && (
        <div className="dirty-banner">
          <CircleAlert size={16} />
          <div>
            <b>存在未保存的字体或排版调整，整批合并已被阻止。</b>
            <span>请先保存当前调整，或丢弃调整后再继续，避免预览字体与实际不一致。</span>
          </div>
          <div className="dirty-actions">
            <button className="outline small" onClick={onDiscardSettings}>
              丢弃调整
            </button>
            <button className="primary small" onClick={onSaveSettings}>
              保存调整
            </button>
          </div>
        </div>
      )}

      <div className="review-list">
        {plan.review.map(row => (
          <ReviewRow
            key={row.key}
            row={row}
            fallback={settings}
            onField={onField}
            onRowSide={onRowSide}
          />
        ))}
      </div>

      <div className="merge-actions">
        <button className="outline" onClick={onBack}>
          返回重新粘贴
        </button>
        <button className="primary" onClick={onConfirm} disabled={dirty}>
          <MergeIcon size={15} /> 确认合并{dirty ? '（已阻止）' : ''}
        </button>
      </div>
    </div>
  );
}

function fontText(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : `未提供（沿用 ${fallback}）`;
}

function ReviewRow({
  row,
  fallback,
  onField,
  onRowSide,
}: {
  row: MergePlan['review'][number];
  fallback: TypeSettings;
  onField: (key: string, field: DiffField, value: FieldResolution) => void;
  onRowSide: (key: string, side: FieldResolution) => void;
}) {
  const tag = STATUS_TAG[row.status];
  const differing = [...row.hardFields, ...row.softFields];

  return (
    <div className={`review-row status-${row.status}`}>
      <div className="review-row-head">
        <div className="review-title">
          <span className={`tag ${tag.cls}`}>{tag.label}</span>
          <b>{row.incoming.title}</b>
          <small>{row.incoming.category}</small>
        </div>
        {(row.status === 'conflict' || row.status === 'adjust') && (
          <div className="row-side">
            <button className="ghost-btn small" onClick={() => onRowSide(row.key, 'keep-local')}>
              全部保留本地
            </button>
            <button
              className="ghost-btn small"
              onClick={() => onRowSide(row.key, 'take-incoming')}
            >
              全部采用包内
            </button>
          </div>
        )}
      </div>

      {row.status === 'new' && (
        <div className="review-detail">
          <p className="incoming-only">{row.incoming.body}</p>
          <span className="micro">
            {row.incoming.headingFont ?? fallback.headingFont} +{' '}
            {row.incoming.bodyFont ?? fallback.bodyFont} ·{' '}
            {row.incoming.favorite ? '已收藏' : '未收藏'}
          </span>
        </div>
      )}

      {row.status === 'identical' && (
        <div className="review-detail">
          <span className="micro">字体、正文与收藏完全一致，无需处理。</span>
        </div>
      )}

      {(row.status === 'conflict' || row.status === 'adjust') && row.local && (
        <div className="field-picks">
          {differing.map(field => (
            <FieldPick
              key={field}
              field={field}
              localValue={
                field === 'body'
                  ? row.local!.body
                  : field === 'headingFont'
                    ? row.local!.headingFont
                    : field === 'bodyFont'
                      ? row.local!.bodyFont
                      : row.local!.favorite
                        ? '已收藏'
                        : '未收藏'
              }
              incomingValue={
                field === 'body'
                  ? row.incoming.body
                  : field === 'headingFont'
                    ? fontText(row.incoming.headingFont, fallback.headingFont)
                    : field === 'bodyFont'
                      ? fontText(row.incoming.bodyFont, fallback.bodyFont)
                      : row.incoming.favorite
                        ? '已收藏'
                        : '未收藏'
              }
              value={row.resolution[field]}
              soft={field === 'favorite'}
              onChange={v => onField(row.key, field, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldPick({
  field,
  localValue,
  incomingValue,
  value,
  soft,
  onChange,
}: {
  field: DiffField;
  localValue: string;
  incomingValue: string;
  soft: boolean;
  value: FieldResolution;
  onChange: (v: FieldResolution) => void;
}) {
  return (
    <div className={`field-pick ${soft ? 'soft' : 'hard'}`}>
      <span className="field-name">{FIELD_LABELS[field]}</span>
      <div className="pick-options">
        <button
          type="button"
          className={value === 'keep-local' ? 'pick keep on' : 'pick keep'}
          onClick={() => onChange('keep-local')}
        >
          <span className="pick-side">本地</span>
          <span className="pick-value" title={localValue}>
            {localValue}
          </span>
        </button>
        <button
          type="button"
          className={value === 'take-incoming' ? 'pick take on' : 'pick take'}
          onClick={() => onChange('take-incoming')}
        >
          <span className="pick-side">包内</span>
          <span className="pick-value" title={incomingValue}>
            {incomingValue}
          </span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ResultStage({
  batch,
  pairsAfter,
  onUndo,
  onRestart,
  onClose,
}: {
  batch: MergeBatch;
  pairsAfter: Pair[];
  onUndo: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const favCount = pairsAfter.filter(p => p.favorite).length;
  return (
    <div className="merge-body">
      <div className="result-banner">
        <CheckCircle2 size={18} />
        <div>
          <b>合并完成，已生成可撤销批次</b>
          <span>
            「{batch.packageName}」· 加入 {batch.added} · 更新 {batch.updated} · 保留{' '}
            {batch.kept} · 跳过 {batch.skipped} · 当前收藏 {favCount}
          </span>
        </div>
      </div>

      <div className="result-list">
        {batch.processed.map(item => {
          const tag = OUTCOME_TAG[item.outcome];
          return (
            <div key={item.key} className="result-row">
              <span className={`tag ${tag.cls}`}>{tag.label}</span>
              <b>{item.title}</b>
              <span className="result-detail">{item.detail}</span>
            </div>
          );
        })}
      </div>

      <div className="merge-actions">
        <button className="outline" onClick={onUndo}>
          <Undo2 size={15} /> 撤销 · 恢复合并前快照
        </button>
        <button className="outline" onClick={onRestart}>
          再合并一包
        </button>
        <button className="primary" onClick={onClose}>
          完成
        </button>
      </div>
    </div>
  );
}
