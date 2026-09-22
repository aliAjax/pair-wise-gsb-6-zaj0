import {useEffect, useState} from 'react';
import {
  BookOpen,
  ChevronDown,
  Download,
  GitMerge,
  Grid3X3,
  Heart,
  Plus,
  Settings2,
  SlidersHorizontal,
  Star,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import MergeConsole from './merge/MergeConsole';
import {DEFAULT_TYPO} from './merge/merge';
import {dropBatch, loadBatches, loadPairs, saveBatch, savePairs} from './merge/storage';
import type {AppliedMerge, MergeBatch, Pair, TypoDraft} from './merge/types';

const fonts = ['Fraunces', 'DM Sans', 'Space Grotesk', 'Newsreader', 'IBM Plex Sans', 'Playfair Display'];

const seed: Pair[] = [
  {id: 1, ...DEFAULT_TYPO, title: 'Editorial calm', heading: 'A slower way to see', body: 'Good typography creates space for ideas to breathe. Pair a confident display face with a quiet, generous text face.', category: 'Editorial', favorite: true, headingFont: 'Fraunces', bodyFont: 'DM Sans'},
  {id: 2, title: 'Studio notes', heading: 'Make room for the unexpected', body: 'A thoughtful pairing can add rhythm to even the simplest interface. Try contrast in shape, not just size.', category: 'Portfolio', favorite: false, headingFont: 'Playfair Display', bodyFont: 'Newsreader', size: 46, weight: 600, leading: 1.25, tracking: 0},
  {id: 3, title: 'Field guide', heading: 'Small details, lasting impressions', body: 'Typography is the voice of a page. Find a combination that feels clear, warm and distinctly yours.', category: 'Brand', favorite: false, headingFont: 'Space Grotesk', bodyFont: 'IBM Plex Sans', size: 46, weight: 600, leading: 1.25, tracking: 0},
];

function typoOf(p: Pair): TypoDraft {
  return {
    headingFont: p.headingFont,
    bodyFont: p.bodyFont,
    size: p.size,
    weight: p.weight,
    leading: p.leading,
    tracking: p.tracking,
  };
}

const initialPairs = loadPairs(seed);

export default function App() {
  const [pairs, setPairs] = useState<Pair[]>(() => initialPairs);
  const [selected, setSelected] = useState<number>(() => initialPairs[0]?.id ?? 0);
  const [nextId, setNextId] = useState(
    () => initialPairs.reduce((m, p) => Math.max(m, p.id + 1), Date.now()),
  );
  const [typo, setTypo] = useState<TypoDraft>(() =>
    initialPairs[0] ? typoOf(initialPairs[0]) : DEFAULT_TYPO,
  );
  const [typoDirty, setTypoDirty] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showMerge, setShowMerge] = useState(false);
  const [batches, setBatches] = useState<MergeBatch[]>(() => loadBatches());

  const current = pairs.find(p => p.id === selected) || pairs[0];
  const lastBatch = batches[0];

  // 配对库任何变化（收藏、删除、合并、撤销）都同步到本地存储。
  useEffect(() => savePairs(pairs), [pairs]);

  // 切换选中项时，画布控制载入该条已保存的字体/排版。
  const selectPair = (id: number) => {
    const p = pairs.find(x => x.id === id);
    if (!p) return;
    setSelected(id);
    setTypo(typoOf(p));
    setTypoDirty(false);
  };

  const patchTypo = (patch: Partial<TypoDraft>) => {
    setTypo(t => ({...t, ...patch}));
    setTypoDirty(true);
  };

  const saveTypo = () => {
    if (!current) return;
    setPairs(ps => ps.map(p => (p.id === current.id ? {...p, ...typo} : p)));
    setTypoDirty(false);
  };

  const discardTypo = () => {
    if (current) setTypo(typoOf(current));
    setTypoDirty(false);
  };

  const create = () => {
    if (!newTitle.trim()) return;
    const id = nextId;
    setNextId(n => n + 1);
    const pair: Pair = {
      id,
      title: newTitle.trim(),
      heading: 'Your new headline',
      body: 'Start with a sentence that lets your type pairing show its character.',
      category: 'Untitled',
      favorite: false,
      ...DEFAULT_TYPO,
    };
    setPairs(ps => [...ps, pair]);
    setNewTitle('');
    setShowAdd(false);
    selectPair(id);
  };

  const toggleFav = () => {
    if (!current) return;
    setPairs(ps => ps.map(p => (p.id === current.id ? {...p, favorite: !p.favorite} : p)));
  };

  const removeCurrent = () => {
    if (!current) return;
    const rest = pairs.filter(p => p.id !== current.id);
    setPairs(rest);
    const next = rest[0];
    if (next) selectPair(next.id);
    setTypoDirty(false);
  };

  const exportCss = () => {
    if (!current) return;
    const css = `/* ${current.title} */\n.heading { font-family: '${typo.headingFont}'; font-size: ${typo.size}px; font-weight: ${typo.weight}; }\n.body { font-family: '${typo.bodyFont}'; line-height: ${typo.leading}; letter-spacing: ${typo.tracking}px; }`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([css], {type: 'text/css'}));
    a.download = 'type-pair.css';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---- 合并台回调 ----
  const handleApplied = (applied: AppliedMerge, batch: MergeBatch) => {
    setPairs(applied.pairs);
    setNextId(applied.nextId);
    setBatches(saveBatch(batch));
    // 合并已落库，画布控制与新库对齐，消除脏状态。
    const p = applied.pairs.find(x => x.id === selected) ?? applied.pairs[0];
    if (p) {
      setSelected(p.id);
      setTypo(typoOf(p));
    }
    setTypoDirty(false);
  };

  const undoBatch = () => {
    if (!lastBatch) return;
    setPairs(lastBatch.snapshot);
    setNextId(lastBatch.nextIdBefore);
    const p = lastBatch.snapshot.find(x => x.id === selected) ?? lastBatch.snapshot[0];
    if (p) {
      setSelected(p.id);
      setTypo(typoOf(p));
    }
    setTypoDirty(false);
    setBatches(dropBatch(lastBatch.id));
  };

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="brand-mark"><Type size={18} /></div>
          <div><b>Type Pairer</b><small>FIND YOUR VOICE</small></div>
        </div>
        <div className="nav-section">
          <span>LIBRARY</span>
          <button className="nav active"><Grid3X3 size={16} />All pairings <b>{pairs.length}</b></button>
          <button className="nav"><Heart size={16} />Favorites <b>{pairs.filter(p => p.favorite).length}</b></button>
        </div>
        <div className="saved">
          <div className="saved-head">
            <span>COLLECTIONS</span>
            <button onClick={() => setShowAdd(true)}><Plus size={14} /></button>
          </div>
          <button className="collection"><i style={{background: '#e8b7a0'}} />Editorial <b>{pairs.filter(p => p.category === 'Editorial').length || 4}</b></button>
          <button className="collection"><i style={{background: '#9fc9be'}} />Portfolio <b>{pairs.filter(p => p.category === 'Portfolio').length || 3}</b></button>
          <button className="collection"><i style={{background: '#b4add8'}} />Brand voice <b>{pairs.filter(p => p.category === 'Brand').length || 5}</b></button>
        </div>
        <div className="aside-foot">
          <button className="nav"><Settings2 size={16} />Preferences</button>
          <div className="profile">
            <div className="avatar">YL</div>
            <div><b>Yuki Lin</b><small>Design workspace</small></div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <div className="crumb">TYPE LIBRARY / <b>PAIRING STUDIO</b></div>
            <h1>Find the right conversation.</h1>
            <p>Explore combinations, tune the details, and merge packs without losing local work.</p>
          </div>
          <div className="actions">
            <button className="outline" onClick={exportCss}><Download size={15} />Copy CSS</button>
            <button className="outline merge-entry" onClick={() => setShowMerge(true)}>
              <GitMerge size={15} />Merge pack
            </button>
            <button className="primary" onClick={() => setShowAdd(true)}><Plus size={16} />New pairing</button>
          </div>
        </header>

        <div className="layout">
          <section className="gallery">
            <div className="gallery-head">
              <div>
                <h2>Saved pairings</h2>
                <span>{pairs.length} compositions · {pairs.filter(p => p.favorite).length} favorites</span>
              </div>
              <div className="view-toggle">
                <button className="on"><Grid3X3 size={14} /></button>
                <button><BookOpen size={14} /></button>
              </div>
            </div>
            <div className="pair-list">
              {pairs.map(p => (
                <button
                  key={p.id}
                  className={selected === p.id ? 'pair selected' : 'pair'}
                  onClick={() => selectPair(p.id)}
                >
                  <div className="pair-top">
                    <span>{p.category}</span>
                    <Heart size={15} fill={p.favorite ? '#e88769' : 'none'} color={p.favorite ? '#e88769' : '#aeb5b7'} />
                  </div>
                  <strong style={{fontFamily: p.headingFont}}>{p.heading}</strong>
                  <p style={{fontFamily: p.bodyFont}}>{p.body}</p>
                  <div className="pair-foot">
                    <span>{p.title} · {p.headingFont}/{p.bodyFont}</span>
                    <small>Open canvas →</small>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="studio">
            <div className="studio-head">
              <div>
                <span>PAIRING CANVAS</span>
                <h2>{current?.title ?? 'No pairing'}</h2>
              </div>
              {current && (
                <button className="favorite" onClick={toggleFav}>
                  <Star size={16} fill={current.favorite ? '#e5a35e' : 'none'} color={current.favorite ? '#e5a35e' : '#98a4a7'} />
                </button>
              )}
            </div>
            {current && (
              <>
                <div className="canvas">
                  <div className="canvas-bar">
                    <span>PREVIEW{typoDirty && <i className="dirty-dot">· 未保存的调整</i>}</span>
                    <div>
                      <button>Desktop</button><button>Tablet</button><button>Mobile</button>
                    </div>
                  </div>
                  <div className="preview">
                    <span className="preview-kicker">A NOTE ON TYPE</span>
                    <h3 style={{fontFamily: typo.headingFont, fontSize: `${typo.size}px`, fontWeight: typo.weight, letterSpacing: `${typo.tracking}px`, lineHeight: 1.05}}>{current.heading}</h3>
                    <p style={{fontFamily: typo.bodyFont, lineHeight: typo.leading, letterSpacing: `${typo.tracking / 2}px`}}>{current.body}</p>
                    <div className="preview-rule" />
                    <span className="preview-meta">PAIRING 0{current.id} · {current.category.toUpperCase()}</span>
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
                    <label>Heading font
                      <select value={typo.headingFont} onChange={e => patchTypo({headingFont: e.target.value})}>
                        {fonts.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </label>
                    <label>Body font
                      <select value={typo.bodyFont} onChange={e => patchTypo({bodyFont: e.target.value})}>
                        {fonts.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="range-row">
                    <label>Size <b>{typo.size}px</b><input type="range" min="28" max="76" value={typo.size} onChange={e => patchTypo({size: Number(e.target.value)})} /></label>
                    <label>Weight <b>{typo.weight}</b><input type="range" min="300" max="800" step="100" value={typo.weight} onChange={e => patchTypo({weight: Number(e.target.value)})} /></label>
                  </div>
                  <div className="range-row">
                    <label>Line height <b>{typo.leading.toFixed(2)}</b><input type="range" min="1" max="1.8" step=".05" value={typo.leading} onChange={e => patchTypo({leading: Number(e.target.value)})} /></label>
                    <label>Letter spacing <b>{typo.tracking}px</b><input type="range" min="-1" max="3" step=".5" value={typo.tracking} onChange={e => patchTypo({tracking: Number(e.target.value)})} /></label>
                  </div>
                </div>
                <div className="studio-foot">
                  <button className="delete" onClick={removeCurrent}><Trash2 size={15} />Delete pairing</button>
                  {typoDirty ? (
                    <div className="unsaved-actions">
                      <button className="discard" onClick={discardTypo}><X size={13} />Discard</button>
                      <button className="save active" onClick={saveTypo}>Save changes</button>
                    </div>
                  ) : (
                    <button className="save" onClick={saveTypo}>✓ Saved locally</button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {lastBatch && (
        <div className="undo-banner">
          <GitMerge size={15} />
          <div className="grow">
            <b>{lastBatch.label}</b>
            <span>{new Date(lastBatch.at).toLocaleTimeString()} 合并 · 收藏总数 {lastBatch.result.favoritesAfter}（列表与本地存储已同步）</span>
          </div>
          <button className="undo-btn" onClick={undoBatch}><Undo2 size={14} />撤销此批次</button>
          <button className="undo-x" onClick={() => setBatches(dropBatch(lastBatch.id))}><X size={13} /></button>
        </div>
      )}

      {showAdd && (
        <div className="backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>New pairing</h2>
            <label>Pairing name
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Quiet confidence" />
            </label>
            <div className="modal-actions">
              <button className="outline" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="primary" onClick={create}>Create pairing</button>
            </div>
          </div>
        </div>
      )}

      {showMerge && (
        <MergeConsole
          localPairs={pairs}
          nextId={nextId}
          blocked={typoDirty}
          onSaveTypo={saveTypo}
          onDiscardTypo={discardTypo}
          onClose={() => setShowMerge(false)}
          onApplied={handleApplied}
        />
      )}
    </div>
  );
}
