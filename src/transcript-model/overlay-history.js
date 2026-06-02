/**
 * Format-agnostic overlay edit + snapshot-history helpers, shared by the rigid
 * (rev.ai) and whisperx tiers. An "overlay" is a sparse plain object keyed by a
 * per-word anchor string; each entry is `{ value?, muted? }`. These helpers know
 * nothing about a specific STT schema — only how to edit and version an overlay —
 * so both `rev-overlay.js` and `whisperx-overlay.js` build on them (and re-export
 * them, keeping their existing import surface unchanged).
 */

const clone = (obj) => JSON.parse(JSON.stringify(obj));

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

export default { setWordValue, setWordMuted, revertWord, HISTORY_CAP, newHistory, commit, canUndo, canRedo, undo, redo, currentOverlay };
