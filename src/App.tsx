import {useEffect, useMemo, useState} from 'react';
import {
  BookOpen,
  ChevronDown,
  Download,
  Grid3X3,
  Heart,
  Merge as MergeIcon,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Star,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import MergeConsole from './merge/MergeConsole';
import {dropBatch, loadBatches, saveBatch, settingsEqual} from './merge/rules';
import type {MergeBatch, Pair, TypeSettings} from './merge/types';
import {KNOWN_FONTS} from './merge/validation';

const PAIRS_KEY = 'type-pairs';
const SETTINGS_KEY = 'type-settings';

const DEFAULT_SETTINGS: TypeSettings = {
  headingFont: 'Fraunces',
  bodyFont: 'DM Sans',
  size: 46,
  weight: 600,
  leading: 1.25,
  tracking: 0,
};

const seedRaw = [
  {
    id: 1,
    title: 'Editorial calm',
    heading: 'A slower way to see',
    body: 'Good typography creates space for ideas to breathe. Pair a confident display face with a quiet, generous text face.',
    category: 'Editorial',
    favorite: true,
  },
  {
    id: 2,
    title: 'Studio notes',
    heading: 'Make room for the unexpected',
    body: 'A thoughtful pairing can add rhythm to even the simplest interface. Try contrast in shape, not just size.',
    category: 'Portfolio',
    favorite: false,
  },
  {
    id: 3,
    title: 'Field guide',
    heading: 'Small details, lasting impressions',
    body: 'Typography is the voice of a page. Find a combination that feels clear, warm and distinctly yours.',
    category: 'Brand',
    favorite: false,
  },
];

function loadPairs(): Pair[] {
  try {
    const raw = localStorage.getItem(PAIRS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Array<Partial<Pair>>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate records saved before fonts lived on each pair.
        return parsed.map(p => ({
          id: Number(p.id) || Date.now(),
          title: String(p.title ?? 'Untitled'),
          heading: String(p.heading ?? p.title ?? 'Untitled'),
          body: String(p.body ?? ''),
          category: String(p.category ?? 'Untitled'),
          favorite: p.favorite === true,
          headingFont: p.headingFont || DEFAULT_SETTINGS.headingFont,
          bodyFont: p.bodyFont || DEFAULT_SETTINGS.bodyFont,
        }));
      }
    }
  } catch {
    // fall through to seed
  }
  return seedRaw.map(p => ({
    ...p,
    headingFont: DEFAULT_SETTINGS.headingFont,
    bodyFont: DEFAULT_SETTINGS.bodyFont,
  }));
}

function loadSettings(): TypeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return {...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<TypeSettings>)};
  } catch {
    // fall through
  }
  return DEFAULT_SETTINGS;
}

export default function App() {
  const [pairs, setPairs] = useState<Pair[]>(loadPairs);
  const [savedSettings, setSavedSettings] = useState<TypeSettings>(loadSettings);
  const [draft, setDraft] = useState<TypeSettings>(loadSettings);
  const [selected, setSelected] = useState<number | null>(1);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showMerge, setShowMerge] = useState(false);
  const [batches, setBatches] = useState<MergeBatch[]>(loadBatches);

  const dirty = useMemo(() => !settingsEqual(draft, savedSettings), [draft, savedSettings]);
  const current = pairs.find(p => p.id === selected) ?? pairs[0];
  const favoriteCount = pairs.filter(p => p.favorite).length;
  const latestBatch = batches[0];

  useEffect(() => {
    localStorage.setItem(PAIRS_KEY, JSON.stringify(pairs));
  }, [pairs]);

  const patchDraft = (patch: Partial<TypeSettings>) => setDraft(d => ({...d, ...patch}));

  const saveSettings = () => setSavedSettings(draft);
  const discardSettings = () => setDraft(savedSettings);

  const create = () => {
    if (!newTitle.trim()) return;
    const id = Date.now();
    setPairs(ps => [
      ...ps,
      {
        id,
        title: newTitle.trim(),
        heading: 'Your new headline',
        body: 'Start with a sentence that lets your type pairing show its character.',
        category: 'Untitled',
        favorite: false,
        headingFont: savedSettings.headingFont,
        bodyFont: savedSettings.bodyFont,
      },
    ]);
    setSelected(id);
    setNewTitle('');
    setShowAdd(false);
  };

  const toggleFav = () => {
    if (!current) return;
    setPairs(ps => ps.map(p => (p.id === current.id ? {...p, favorite: !p.favorite} : p)));
  };

  const removeCurrent = () => {
    if (!current) return;
    const rest = pairs.filter(p => p.id !== current.id);
    setPairs(rest);
    setSelected(rest[0]?.id ?? null);
  };

  const exportCss = () => {
    if (!current) return;
    const css = `/* ${current.title} */\n.heading { font-family: '${current.headingFont}'; font-size: ${draft.size}px; font-weight: ${draft.weight}; }\n.body { font-family: '${current.bodyFont}'; line-height: ${draft.leading}; letter-spacing: ${draft.tracking}px; }`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([css], {type: 'text/css'}));
    a.download = 'type-pair.css';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // --- merge batch handlers -------------------------------------------------

  const handleCommit = (nextPairs: Pair[], batch: MergeBatch) => {
    setPairs(nextPairs);
    setBatches(saveBatch(batch));
    const firstAdded = nextPairs.find(p => !batch.snapshot.some(s => s.id === p.id));
    if (firstAdded) setSelected(firstAdded.id);
  };

  const handleUndo = (restored: Pair[], batchId: string) => {
    setPairs(restored); // favorites count + list + storage all follow this state
    setBatches(dropBatch(batchId));
    if (!restored.some(p => p.id === selected)) setSelected(restored[0]?.id ?? null);
  };

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="brand-mark">
            <Type size={18} />
          </div>
          <div>
            <b>Type Pairer</b>
            <small>PAIR · MERGE · KEEP</small>
          </div>
        </div>
        <div className="nav-section">
          <span>LIBRARY</span>
          <button className="nav active">
            <Grid3X3 size={16} />
            All pairings <b>{pairs.length}</b>
          </button>
          <button className="nav">
            <Heart size={16} />
            Favorites <b>{favoriteCount}</b>
          </button>
        </div>
        <div className="saved">
          <div className="saved-head">
            <span>WORKSPACE</span>
            <button onClick={() => setShowAdd(true)}>
              <Plus size={14} />
            </button>
          </div>
          <button className="collection" onClick={() => setShowMerge(true)}>
            <i className="merge-dot">
              <MergeIcon size={10} />
            </i>
            配对包合并台 <b>{batches.length}</b>
          </button>
          <button className="collection">
            <i style={{background: '#e8b7a0'}} />
            Editorial <b>4</b>
          </button>
          <button className="collection">
            <i style={{background: '#9fc9be'}} />
            Portfolio <b>3</b>
          </button>
          <button className="collection">
            <i style={{background: '#b4add8'}} />
            Brand voice <b>5</b>
          </button>
        </div>
        <div className="aside-foot">
          <button className="nav">
            <Settings2 size={16} />
            Preferences
          </button>
          <div className="profile">
            <div className="avatar">YL</div>
            <div>
              <b>Yuki Lin</b>
              <small>Design workspace</small>
            </div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">
              TYPE LIBRARY / <b>PAIRING STUDIO</b>
            </div>
            <h1>Find the right conversation.</h1>
            <p>Explore combinations, tune the details, and merge packages without losing a local note.</p>
          </div>
          <div className="actions">
            <button className="outline" onClick={() => setShowMerge(true)}>
              <MergeIcon size={15} />
              合并配对包
            </button>
            <button className="outline" onClick={exportCss}>
              <Download size={15} />
              Copy CSS
            </button>
            <button className="primary" onClick={() => setShowAdd(true)}>
              <Plus size={16} />
              New pairing
            </button>
          </div>
        </header>

        {dirty && (
          <div className="dirty-strip">
            <SlidersHorizontal size={14} />
            <span>存在未保存的字体或排版调整；合并配对包将被整批阻止，直到保存或丢弃。</span>
            <button className="ghost-btn small" onClick={discardSettings}>
              <RotateCcw size={12} /> 丢弃
            </button>
            <button className="primary small" onClick={saveSettings}>
              保存调整
            </button>
          </div>
        )}

        {latestBatch && !showMerge && (
          <div className="undo-strip">
            <Undo2 size={14} />
            <span>
              「{latestBatch.packageName}」已合并 · 加入 {latestBatch.added} · 更新{' '}
              {latestBatch.updated} · 保留 {latestBatch.kept} · 跳过 {latestBatch.skipped}
            </span>
            <button
              className="ghost-btn small"
              onClick={() => handleUndo(latestBatch.snapshot.map(p => ({...p})), latestBatch.id)}
            >
              <Undo2 size={12} /> 撤销此批次
            </button>
          </div>
        )}

        <div className="layout">
          <section className="gallery">
            <div className="gallery-head">
              <div>
                <h2>Saved pairings</h2>
                <span>
                  {pairs.length} compositions · {favoriteCount} favorites
                </span>
              </div>
              <div className="view-toggle">
                <button className="on">
                  <Grid3X3 size={14} />
                </button>
                <button>
                  <BookOpen size={14} />
                </button>
              </div>
            </div>
            <div className="pair-list">
              {pairs.map(p => (
                <button
                  key={p.id}
                  className={current?.id === p.id ? 'pair selected' : 'pair'}
                  onClick={() => setSelected(p.id)}
                >
                  <div className="pair-top">
                    <span>{p.category}</span>
                    <Heart
                      size={15}
                      fill={p.favorite ? '#e88769' : 'none'}
                      color={p.favorite ? '#e88769' : '#aeb5b7'}
                    />
                  </div>
                  <strong style={{fontFamily: p.headingFont}}>
                    {p.heading}
                  </strong>
                  <p style={{fontFamily: p.bodyFont}}>{p.body}</p>
                  <div className="pair-foot">
                    <span>{p.title}</span>
                    <small>Open canvas →</small>
                  </div>
                </button>
              ))}
              {pairs.length === 0 && <div className="empty-list">还没有配对，先新建或合并一包。</div>}
            </div>
          </section>

          {current ? (
            <section className="studio">
              <div className="studio-head">
                <div>
                  <span>PAIRING CANVAS</span>
                  <h2>{current.title}</h2>
                </div>
                <button className="favorite" onClick={toggleFav}>
                  <Star
                    size={16}
                    fill={current.favorite ? '#e5a35e' : 'none'}
                    color={current.favorite ? '#e5a35e' : '#98a4a7'}
                  />
                </button>
              </div>
              <div className="canvas">
                <div className="canvas-bar">
                  <span>PREVIEW</span>
                  <div>
                    <button>Desktop</button>
                    <button>Tablet</button>
                    <button>Mobile</button>
                  </div>
                </div>
                <div className="preview">
                  <span className="preview-kicker">A NOTE ON TYPE</span>
                  <h3
                    style={{
                      fontFamily: current.headingFont,
                      fontSize: `${draft.size}px`,
                      fontWeight: draft.weight,
                      letterSpacing: `${draft.tracking}px`,
                      lineHeight: 1.05,
                    }}
                  >
                    {current.heading}
                  </h3>
                  <p
                    style={{
                      fontFamily: current.bodyFont,
                      lineHeight: draft.leading,
                      letterSpacing: `${draft.tracking / 2}px`,
                    }}
                  >
                    {current.body}
                  </p>
                  <div className="preview-rule" />
                  <span className="preview-meta">
                    PAIRING {String(current.id).slice(-3)} · {current.category.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="controls">
                <div className="control-head">
                  <div>
                    <span>TYPE CONTROLS</span>
                    <h3>Fine tune your pairing</h3>
                  </div>
                  <SlidersHorizontal size={17} />
                </div>
                <div className="font-row">
                  <label>
                    Heading font
                    <select
                      value={draft.headingFont}
                      onChange={e => patchDraft({headingFont: e.target.value})}
                    >
                      {KNOWN_FONTS.map(f => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Body font
                    <select
                      value={draft.bodyFont}
                      onChange={e => patchDraft({bodyFont: e.target.value})}
                    >
                      {KNOWN_FONTS.map(f => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="range-row">
                  <label>
                    Size <b>{draft.size}px</b>
                    <input
                      type="range"
                      min="28"
                      max="76"
                      value={draft.size}
                      onChange={e => patchDraft({size: Number(e.target.value)})}
                    />
                  </label>
                  <label>
                    Weight <b>{draft.weight}</b>
                    <input
                      type="range"
                      min="300"
                      max="800"
                      step="100"
                      value={draft.weight}
                      onChange={e => patchDraft({weight: Number(e.target.value)})}
                    />
                  </label>
                </div>
                <div className="range-row">
                  <label>
                    Line height <b>{draft.leading.toFixed(2)}</b>
                    <input
                      type="range"
                      min="1"
                      max="1.8"
                      step=".05"
                      value={draft.leading}
                      onChange={e => patchDraft({leading: Number(e.target.value)})}
                    />
                  </label>
                  <label>
                    Letter spacing <b>{draft.tracking}px</b>
                    <input
                      type="range"
                      min="-1"
                      max="3"
                      step=".5"
                      value={draft.tracking}
                      onChange={e => patchDraft({tracking: Number(e.target.value)})}
                    />
                  </label>
                </div>
              </div>
              <div className="studio-foot">
                <button className="delete" onClick={removeCurrent}>
                  <Trash2 size={15} />
                  Delete pairing
                </button>
                <button
                  className={dirty ? 'save pending' : 'save'}
                  onClick={saveSettings}
                  disabled={!dirty}
                >
                  {dirty ? '保存排版调整' : '✓ 调整已保存'}
                </button>
              </div>
            </section>
          ) : (
            <section className="studio empty-studio">
              <p>没有选中的配对。新建一条，或从合并台导入配对包。</p>
            </section>
          )}
        </div>
      </main>

      {showAdd && (
        <div className="backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>New pairing</h2>
            <label>
              Pairing name
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Quiet confidence"
              />
            </label>
            <div className="modal-actions">
              <button className="outline" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button className="primary" onClick={create}>
                Create pairing
              </button>
            </div>
          </div>
        </div>
      )}

      {showMerge && (
        <MergeConsole
          pairs={pairs}
          settings={savedSettings}
          dirty={dirty}
          batches={batches}
          onCommit={handleCommit}
          onUndo={handleUndo}
          onSaveSettings={saveSettings}
          onDiscardSettings={discardSettings}
          onClose={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}
