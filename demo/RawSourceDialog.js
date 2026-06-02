import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { lintGutter, linter } from '@codemirror/lint';
import { autocompletion } from '@codemirror/autocomplete';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';

const ALLOWED_TYPES = ['text', 'punct', 'unknown'];

const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch (e) {
    return s.replace(/^"|"$/g, '');
  }
};

// ---- syntax-tree mapping: ordered stream words {from,to,text, key|index,start} ----
// Walks CodeMirror's live JSON tree so positions stay correct as the doc is edited.
const objProp = (objNode, name, doc) => {
  for (const p of objNode.getChildren('Property')) {
    const nameNode = p.getChild('PropertyName');
    if (nameNode && safeJson(doc.sliceString(nameNode.from, nameNode.to)) === name) return p;
  }
  return null;
};
const propValue = (propNode) => (propNode ? propNode.lastChild : null);

const buildIndex = (state, tier) => {
  // ensureSyntaxTree forces a full parse (syntaxTree alone is incremental and
  // only covers the parsed prefix on large docs, which truncated the stream).
  const tree = ensureSyntaxTree(state, state.doc.length, 1500) || syntaxTree(state);
  const doc = state.doc;
  const root = tree.topNode.firstChild;
  if (!root || root.name !== 'Object') return [];
  const out = [];
  const strOf = (node) => (node && node.name === 'String' ? safeJson(doc.sliceString(node.from, node.to)) : undefined);

  if (tier === 'rev') {
    const monoArr = propValue(objProp(root, 'monologues', doc));
    if (!monoArr || monoArr.name !== 'Array') return [];
    let m = 0;
    for (const mono of monoArr.getChildren('Object')) {
      const elArr = propValue(objProp(mono, 'elements', doc));
      let e = 0;
      if (elArr && elArr.name === 'Array') {
        for (const el of elArr.getChildren('Object')) {
          const type = strOf(propValue(objProp(el, 'type', doc)));
          const valNode = propValue(objProp(el, 'value', doc));
          const value = strOf(valNode);
          if ((type === 'text' || type === 'unknown') && typeof value === 'string') {
            out.push({ from: valNode.from, to: valNode.to, text: value, key: `${m}:${e}` });
          }
          e += 1;
        }
      }
      m += 1;
    }
  } else if (tier === 'whisperx') {
    // WhisperX text stream walks the flat `word_segments` list ({ word, start, ... }).
    const wordsArr = propValue(objProp(root, 'word_segments', doc));
    if (!wordsArr || wordsArr.name !== 'Array') return [];
    let i = 0;
    for (const w of wordsArr.getChildren('Object')) {
      const textNode = propValue(objProp(w, 'word', doc));
      const startNode = propValue(objProp(w, 'start', doc));
      const text = strOf(textNode);
      const start = startNode && startNode.name === 'Number' ? Number(doc.sliceString(startNode.from, startNode.to)) : undefined;
      if (typeof text === 'string') out.push({ from: textNode.from, to: textNode.to, text, index: i, start });
      i += 1;
    }
  } else {
    const wordsArr = propValue(objProp(root, 'words', doc));
    if (!wordsArr || wordsArr.name !== 'Array') return [];
    let i = 0;
    for (const w of wordsArr.getChildren('Object')) {
      const textNode = propValue(objProp(w, 'text', doc));
      const startNode = propValue(objProp(w, 'start', doc));
      const text = strOf(textNode);
      const start = startNode && startNode.name === 'Number' ? Number(doc.sliceString(startNode.from, startNode.to)) : undefined;
      if (typeof text === 'string') out.push({ from: textNode.from, to: textNode.to, text, index: i, start });
      i += 1;
    }
  }
  return out;
};

const findByLocator = (words, tier, openTo) => {
  if (!openTo) return null;
  if (tier === 'rev' && openTo.key != null) return words.find((w) => w.key === openTo.key) || null;
  if (typeof openTo.start === 'number') {
    let best = null;
    let bestD = Infinity;
    for (const w of words) {
      if (typeof w.start === 'number') {
        const d = Math.abs(w.start - openTo.start);
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
    }
    return best;
  }
  return null;
};

// completion: inside a `"type"` value string, offer text/punct/unknown
const typeCompletionSource = (context) => {
  const tree = syntaxTree(context.state);
  let node = tree.resolveInner(context.pos, -1);
  while (node && node.name !== 'String') node = node.parent;
  if (!node) return null;
  const prop = node.parent;
  if (!prop || prop.name !== 'Property' || prop.lastChild.from !== node.from) return null;
  const nameNode = prop.getChild('PropertyName');
  if (!nameNode || safeJson(context.state.doc.sliceString(nameNode.from, nameNode.to)) !== 'type') return null;
  return { from: node.from + 1, to: node.to - 1, options: ALLOWED_TYPES.map((t) => ({ label: t, type: 'enum' })) };
};

// linter: red underline on any element `type` outside the allowed set
const typeLinter = (view) => {
  const diags = [];
  const doc = view.state.doc;
  syntaxTree(view.state).iterate({
    enter: (ref) => {
      if (ref.name !== 'Property') return;
      const nameNode = ref.node.getChild('PropertyName');
      if (!nameNode || safeJson(doc.sliceString(nameNode.from, nameNode.to)) !== 'type') return;
      const val = ref.node.lastChild;
      if (!val || val.name !== 'String') return;
      const v = safeJson(doc.sliceString(val.from, val.to));
      if (!ALLOWED_TYPES.includes(v)) {
        diags.push({
          from: val.from,
          to: val.to,
          severity: 'error',
          message: `Invalid type ${JSON.stringify(v)}. Allowed: ${ALLOWED_TYPES.join(', ')}.`,
        });
      }
    },
  });
  return diags;
};

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
});

const CSS = `
.rsd-stream { line-height: 1.7; font-size: 14px; }
.rsd-word { cursor: pointer; border-radius: 2px; padding: 0 1px; }
.rsd-word:hover { text-decoration: underline; }
.rsd-word--in { background: #bbdefb; box-shadow: 0 0 0 1px #64b5f6; }
`;

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    background: '#fff',
    borderRadius: 8,
    width: 'min(1150px, 95vw)',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
    overflow: 'hidden',
    fontFamily: 'Roboto, system-ui, sans-serif',
  },
  header: { padding: '12px 16px', borderBottom: '1px solid #e0e0e0', fontWeight: 600, fontSize: 15 },
  body: { display: 'flex', minHeight: 0, flex: '1 1 auto' },
  editorPane: { flex: '1.4 1 0', height: '60vh', overflow: 'hidden', borderRight: '1px solid #e0e0e0' },
  streamPane: { flex: '1 1 0', height: '60vh', overflow: 'auto', padding: '12px 14px', background: '#fafafa' },
  streamLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#777', letterSpacing: 0.4, marginBottom: 8 },
  status: { padding: '8px 16px', fontSize: 13, fontFamily: 'monospace', whiteSpace: 'pre-wrap', borderTop: '1px solid #e0e0e0' },
  ok: { color: '#2e7d32' },
  error: { color: '#c62828', background: '#ffebee' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: '0.6em', padding: '12px 16px' },
  btn: { cursor: 'pointer', border: '1px solid #1976d2', background: '#1976d2', color: '#fff', borderRadius: 4, padding: '7px 14px', fontSize: 14 },
  btnDisabled: { cursor: 'not-allowed', background: '#90caf9', borderColor: '#90caf9' },
  btnGhost: { cursor: 'pointer', border: '1px solid #bbb', background: '#fff', color: '#444', borderRadius: 4, padding: '7px 14px', fontSize: 14 },
};

/**
 * Two-pane raw-source editor. Left: CodeMirror 6 JSON (syntax coloring, JSON-parse
 * lint; for rev.ai also `type` autocomplete + an allowed-value linter). Right: the
 * transcript text stream — clicking a word scrolls the JSON to its element; scrolling
 * the JSON frames the corresponding words. Save is gated on validity.
 */
function RawSourceDialog({ initialText, title, tier, openTo, validate, onSave, onCancel }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const streamRef = useRef([]);
  const rightRef = useRef(null);
  const debTimer = useRef(null);
  const [stream, setStream] = useState([]);
  const [visible, setVisible] = useState(null);
  const [error, setError] = useState(null);

  const checkValidity = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    let parsed;
    try {
      parsed = JSON.parse(view.state.doc.toString());
    } catch (e) {
      setError(`Invalid JSON — ${e.message}`);
      return;
    }
    setError(validate ? validate(parsed) : null);
  }, [validate]);

  const rebuildStream = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const words = buildIndex(view.state, tier);
    streamRef.current = words;
    setStream(words);
  }, [tier]);

  const recomputeVisible = useCallback(() => {
    const view = viewRef.current;
    const words = streamRef.current;
    if (!view || !words.length) {
      setVisible(null);
      return;
    }
    const ranges = view.visibleRanges;
    if (!ranges.length) return;
    const vf = ranges[0].from;
    const vt = ranges[ranges.length - 1].to;
    let first = -1;
    let last = -1;
    for (let i = 0; i < words.length; i += 1) {
      if (words[i].to > vf && words[i].from < vt) {
        if (first < 0) first = i;
        last = i;
      }
    }
    setVisible(first >= 0 ? { first, last } : null);
  }, []);

  const scheduleRebuild = useCallback(() => {
    if (debTimer.current) clearTimeout(debTimer.current);
    debTimer.current = setTimeout(() => {
      rebuildStream();
      recomputeVisible();
    }, 200);
  }, [rebuildStream, recomputeVisible]);

  const scrollToWord = (w) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: w.from, head: w.to }, effects: EditorView.scrollIntoView(w.from, { y: 'center' }) });
    view.focus();
  };

  useEffect(() => {
    const extensions = [
      basicSetup,
      json(),
      lintGutter(),
      linter(jsonParseLinter()),
      editorTheme,
      ...(tier === 'rev' ? [autocompletion({ override: [typeCompletionSource] }), linter(typeLinter)] : []),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          checkValidity();
          scheduleRebuild();
        }
        if (u.docChanged || u.viewportChanged || u.geometryChanged) recomputeVisible();
      }),
    ];
    const view = new EditorView({ state: EditorState.create({ doc: initialText, extensions }), parent: hostRef.current });
    viewRef.current = view;
    const onScroll = () => recomputeVisible();
    view.scrollDOM.addEventListener('scroll', onScroll);

    rebuildStream();
    checkValidity();
    const target = findByLocator(streamRef.current, tier, openTo);
    if (target)
      view.dispatch({ selection: { anchor: target.from, head: target.to }, effects: EditorView.scrollIntoView(target.from, { y: 'center' }) });
    requestAnimationFrame(() => recomputeVisible());

    return () => {
      if (debTimer.current) clearTimeout(debTimer.current);
      view.scrollDOM.removeEventListener('scroll', onScroll);
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the framed range visible in the right pane as the JSON scrolls
  useEffect(() => {
    if (!visible || !rightRef.current) return;
    const spans = rightRef.current.querySelectorAll('.rsd-word');
    const el = spans[visible.first];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [visible]);

  const handleSave = () => {
    let parsed;
    try {
      parsed = JSON.parse(viewRef.current.state.doc.toString());
    } catch (e) {
      setError(`Invalid JSON — ${e.message}`);
      return;
    }
    const schemaErr = validate ? validate(parsed) : null;
    if (schemaErr) {
      setError(schemaErr);
      return;
    }
    onSave(parsed);
  };

  return (
    <div style={styles.overlay}>
      <style>{CSS}</style>
      <div style={styles.dialog}>
        <div style={styles.header}>{title || 'Raw source (JSON)'}</div>
        <div style={styles.body}>
          <div ref={hostRef} style={styles.editorPane} />
          <div ref={rightRef} style={styles.streamPane}>
            <div style={styles.streamLabel}>Text stream — click a word to jump · highlighted = visible in JSON</div>
            <div className="rsd-stream">
              {stream.map((w, i) => (
                <span
                  key={i}
                  className={visible && i >= visible.first && i <= visible.last ? 'rsd-word rsd-word--in' : 'rsd-word'}
                  onClick={() => scrollToWord(w)}
                >
                  {w.text}{' '}
                </span>
              ))}
              {stream.length === 0 && <em style={{ color: '#999' }}>(no words found — fix the JSON to see the stream)</em>}
            </div>
          </div>
        </div>
        <div style={{ ...styles.status, ...(error ? styles.error : styles.ok) }}>{error ? `✗ ${error}` : '✓ valid — safe to save'}</div>
        <div style={styles.footer}>
          <button style={styles.btnGhost} onClick={onCancel}>
            Cancel
          </button>
          <button style={error ? { ...styles.btn, ...styles.btnDisabled } : styles.btn} disabled={Boolean(error)} onClick={handleSave}>
            Save &amp; re-import
          </button>
        </div>
      </div>
    </div>
  );
}

export default RawSourceDialog;
