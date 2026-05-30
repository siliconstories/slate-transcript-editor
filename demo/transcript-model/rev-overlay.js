/**
 * rev.ai overlay-on-immutable-original model (framework-free, no React/Slate).
 *
 * The rigid/"scientific" tier never rebuilds the rev.ai file from edited text.
 * Instead it keeps the originally-imported transcript IMMUTABLE and records edits
 * as a sparse OVERLAY keyed by a stable per-text-element anchor `"<monoIdx>:<elemIdx>"`.
 * Export = deep-clone the original and write back only value/confidence per the
 * overlay. This guarantees a byte-faithful Gentle/Otter/rev.ai "monologues" schema
 * round-trip: punctuation, timing, speaker ids, element order are preserved.
 *
 * rev.ai shape:
 *   { monologues:[ { speaker:<number|string>, elements:[
 *       { type:'text',  value, ts, end_ts, confidence(0..1) },
 *       { type:'punct', value }                       // spaces / '.' ',' '?' ...
 *   ] } ] }
 *
 * Edit states (per the agreed rules, confidence stays on rev.ai's native 0..1 scale):
 *   - rewritten word  -> value = newText,  confidence = 1.0
 *   - muted word      -> value = ''     ,  confidence = 1.0   (blanked in the rev export)
 *   - untouched word  -> original value + original confidence (absent confidence stays absent)
 * No word is ever removed, added, or reordered.
 */

export const REV_KEY = (monoIdx, elemIdx) => `${monoIdx}:${elemIdx}`;

export const isRevTranscript = (obj) => Boolean(obj) && typeof obj === 'object' && Array.isArray(obj.monologues);

const deepFreeze = (obj) => {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    Object.keys(obj).forEach((k) => deepFreeze(obj[k]));
  }
  return obj;
};

const clone = (obj) => JSON.parse(JSON.stringify(obj));

/**
 * Build the immutable model from a rev.ai transcript.
 * SINGLE walk: the anchor for each text element is its ORIGINAL element index,
 * so dropping an untimed element never shifts following anchors.
 * @returns {{ original:object, words:Array }} original is deep-frozen; words is the
 *   flat editable list (text elements only) with stable keys + base values.
 */
export const revToModel = (revJson) => {
  if (!isRevTranscript(revJson)) {
    throw new Error('Not a rev.ai transcript: expected a top-level "monologues" array.');
  }
  const original = deepFreeze(clone(revJson));
  const words = [];
  revJson.monologues.forEach((mono, monoIdx) => {
    (mono.elements || []).forEach((el, elemIdx) => {
      if (el && el.type === 'text') {
        words.push({
          key: REV_KEY(monoIdx, elemIdx),
          monoIdx,
          elemIdx,
          value: typeof el.value === 'string' ? el.value : '',
          start: typeof el.ts === 'number' ? el.ts : null,
          end: typeof el.end_ts === 'number' ? el.end_ts : null,
          confidence: typeof el.confidence === 'number' ? el.confidence : null,
          hasConfidence: typeof el.confidence === 'number',
          speaker: mono.speaker,
        });
      }
    });
  });
  return { original, words };
};

/**
 * Faithful rev.ai export: deep-clone the frozen original and apply the overlay.
 * Throws if an overlay anchor does not resolve to a text element (loud failure
 * beats a schema-valid-but-wrong file).
 * @param {object} original - the immutable rev.ai transcript
 * @param {Object<string,{value?:string,muted?:boolean}>} overlay
 * @returns {object} a new rev.ai transcript
 */
export const projectRev = (original, overlay) => {
  const out = clone(original);
  Object.keys(overlay || {}).forEach((key) => {
    const o = overlay[key];
    if (!o || (typeof o.value !== 'string' && !o.muted)) return; // no-op entry
    const sep = key.indexOf(':');
    const monoIdx = Number(key.slice(0, sep));
    const elemIdx = Number(key.slice(sep + 1));
    const mono = out.monologues[monoIdx];
    const el = mono && Array.isArray(mono.elements) ? mono.elements[elemIdx] : null;
    if (!el || el.type !== 'text') {
      throw new Error(`projectRev: overlay anchor "${key}" does not resolve to a text element`);
    }
    if (o.muted) {
      el.value = ''; // muted words are blanked in the faithful export
      el.confidence = 1.0;
    } else {
      el.value = o.value;
      el.confidence = 1.0;
    }
  });
  return out;
};

// ---- overlay edit helpers (pure; overlay is a sparse plain object) ----

/** Set/clear a rewrite for a word. Passing the original value clears the entry. */
export const setWordValue = (overlay, key, newValue, originalValue) => {
  const next = { ...overlay };
  const entry = { ...(next[key] || {}) };
  if (typeof newValue === 'string' && newValue !== originalValue) {
    entry.value = newValue;
  } else {
    delete entry.value;
  }
  if (Object.keys(entry).length === 0) delete next[key];
  else next[key] = entry;
  return next;
};

/** Toggle/clear mute for a word. */
export const setWordMuted = (overlay, key, muted) => {
  const next = { ...overlay };
  const entry = { ...(next[key] || {}) };
  if (muted) entry.muted = true;
  else delete entry.muted;
  if (Object.keys(entry).length === 0) delete next[key];
  else next[key] = entry;
  return next;
};

/** Revert a single word to its imported state. */
export const revertWord = (overlay, key) => {
  const next = { ...overlay };
  delete next[key];
  return next;
};

// ---- snapshot history (sparse-overlay snapshots, capped) ----

export const HISTORY_CAP = 100;

export const newHistory = () => ({ stack: [{}], cursor: 0 });

/** Commit a new overlay state, truncating any redo tail; FIFO-capped. */
export const commit = (history, overlay) => {
  const kept = history.stack.slice(0, history.cursor + 1);
  kept.push(clone(overlay));
  const capped = kept.length > HISTORY_CAP ? kept.slice(kept.length - HISTORY_CAP) : kept;
  return { stack: capped, cursor: capped.length - 1 };
};

export const canUndo = (history) => history.cursor > 0;
export const canRedo = (history) => history.cursor < history.stack.length - 1;

export const undo = (history) => (canUndo(history) ? { ...history, cursor: history.cursor - 1 } : history);
export const redo = (history) => (canRedo(history) ? { ...history, cursor: history.cursor + 1 } : history);

/** Current overlay at the cursor. */
export const currentOverlay = (history) => history.stack[history.cursor] || {};

/**
 * Derive a fresh overlay by diffing the editor's current Slate value against the
 * immutable model, keyed by `_key`. This is how rigid edits (rewrite via the
 * inline word editor, mute via ctrl-click) are captured WITHOUT any src change:
 * the editor mutates word objects in place and emits a new value; we read each
 * word's `_key`, compare text/muted to the model's base, and record patches.
 *
 * RIGID INVARIANT GUARD: the incoming value must have exactly one word per model
 * word (same count, same keys). On any mismatch we REJECT (return null) so the
 * caller snaps back to the projected value — a count change means a structural
 * edit leaked through and the anchor mapping can no longer be trusted.
 *
 * @param {{words:Array}} model
 * @param {Array} slateValue
 * @returns {Object|null} overlay, or null if the value violates the rigid invariant
 */
export const overlayFromSlate = (model, slateValue) => {
  const base = new Map(model.words.map((w) => [w.key, w]));
  const seen = new Set();
  const overlay = {};
  let count = 0;
  for (const para of slateValue || []) {
    const words = para && para.children && Array.isArray(para.children[0].words) ? para.children[0].words : [];
    for (const w of words) {
      count += 1;
      const key = w._key;
      const b = key != null ? base.get(key) : undefined;
      if (!b || seen.has(key)) return null; // unknown/duplicate anchor => structural corruption
      seen.add(key);
      const entry = {};
      if (typeof w.text === 'string' && w.text !== b.value) entry.value = w.text;
      if (w.muted === true) entry.muted = true;
      if (Object.keys(entry).length > 0) overlay[key] = entry;
    }
  }
  if (count !== model.words.length || seen.size !== model.words.length) return null; // count invariant
  return overlay;
};

export default { revToModel, projectRev, isRevTranscript, REV_KEY };
