/**
 * WhisperX overlay-on-immutable-original model (framework-free, no React/Slate).
 *
 * Mirrors `rev-overlay.js` for the WhisperX format: the imported transcript is kept
 * IMMUTABLE and edits are recorded as a sparse OVERLAY keyed by a stable per-word
 * anchor `"<segIdx>:<wordIdx>"` over `segments[].words`. Export = deep-clone the
 * original, write back only word/score per the overlay, rebuild each touched
 * segment's `text`, and regenerate `word_segments`. This guarantees a faithful
 * round-trip of the FULL WhisperX schema — `annotations`, `chunks`,
 * `detected_language`, `annotation_metadata`, and empty-words segments — none of
 * which is ever rebuilt from edited text.
 *
 * WhisperX shape:
 *   { segments:[ { start, end, text, speaker, detected_language, annotations,
 *                  words:[ { word, start, end, score, speaker } ], ... } ],
 *     word_segments:[ { word, start, end, score, speaker } ], // exact concat of segments[].words
 *     annotation_metadata:{ ... } }
 *
 * Edit states (score stays on whisperx's native 0..1 scale):
 *   - rewritten word -> word = newText, score = 1.0 (kept in place)
 *   - untouched word -> original word + original score
 *   - muted word     -> REMOVED from its segment.words. Unlike rev.ai there is no
 *     adjacent space/punct element to clean up: punctuation lives INSIDE the token
 *     and words are separated implicitly by the space-join, so muting is a plain
 *     splice followed by a segment.text rebuild.
 * Rewrites never remove; only muting does.
 */
import {
  setWordValue,
  setWordMuted,
  revertWord,
  newHistory,
  commit,
  undo,
  redo,
  canUndo,
  canRedo,
  currentOverlay,
  HISTORY_CAP,
} from './overlay-history';

export const WHISPERX_KEY = (segIdx, wordIdx) => `${segIdx}:${wordIdx}`;

export const isWhisperxTranscript = (obj) =>
  Boolean(obj) && typeof obj === 'object' && Array.isArray(obj.segments) && Array.isArray(obj.word_segments);

const deepFreeze = (obj) => {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    Object.keys(obj).forEach((k) => deepFreeze(obj[k]));
  }
  return obj;
};

const clone = (obj) => JSON.parse(JSON.stringify(obj));

/**
 * Build the immutable model from a WhisperX transcript. The anchor for each word
 * is its `"<segIdx>:<wordIdx>"` position in `segments[].words`. Empty-words
 * segments contribute zero model words but still live in `original` (so their text
 * and metadata survive export).
 * @returns {{ original:object, words:Array }} original is deep-frozen; words is the
 *   flat editable list with stable keys + base values.
 */
export const whisperxToModel = (whisperxJson) => {
  if (!isWhisperxTranscript(whisperxJson)) {
    throw new Error('Not a WhisperX transcript: expected top-level "segments" and "word_segments" arrays.');
  }
  const original = deepFreeze(clone(whisperxJson));
  const words = [];
  whisperxJson.segments.forEach((seg, segIdx) => {
    const segWords = Array.isArray(seg.words) ? seg.words : [];
    segWords.forEach((w, wordIdx) => {
      words.push({
        key: WHISPERX_KEY(segIdx, wordIdx),
        segIdx,
        wordIdx,
        // WhisperX glues punctuation INTO the token (e.g. "werden,"), so the value
        // carries it and `punctAfter` is always '' (the renderer adds its own space).
        value: typeof w.word === 'string' ? w.word : '',
        start: typeof w.start === 'number' ? w.start : null,
        end: typeof w.end === 'number' ? w.end : null,
        score: typeof w.score === 'number' ? w.score : null,
        hasScore: typeof w.score === 'number',
        speaker: typeof w.speaker === 'string' ? w.speaker : null,
        segSpeaker: typeof seg.speaker === 'string' ? seg.speaker : null,
        punctAfter: '',
      });
    });
  });
  return { original, words };
};

/** Space-join the surviving word tokens of a segment (reproduces segment.text). */
const rebuildSegmentText = (seg) =>
  Array.isArray(seg.words) ? seg.words.map((w) => (typeof w.word === 'string' ? w.word : '')).join(' ') : seg.text;

/** Build a whisperx word from a Freestyle token (one paragraph == one segment). */
const whisperxWordFromToken = (out, token) => {
  if (token.ref != null) {
    const sep = token.ref.indexOf(':');
    const segIdx = Number(token.ref.slice(0, sep));
    const wordIdx = Number(token.ref.slice(sep + 1));
    const orig = out.segments[segIdx] && out.segments[segIdx].words ? out.segments[segIdx].words[wordIdx] : null;
    if (!orig || typeof orig.word !== 'string') {
      throw new Error(`projectWhisperx: freetext token ref "${token.ref}" does not resolve to a word`);
    }
    const w = clone(orig); // survivor: keep original start/end/score/speaker
    if (token.value !== orig.word) {
      w.word = token.value;
      w.score = 1.0; // rewrite convention
    }
    return w;
  }
  // inserted word: interpolated timing, score 1.0
  const w = { word: token.value, start: token.start, end: token.end, score: 1.0 };
  return w;
};

/**
 * Faithful WhisperX export: deep-clone the frozen original and apply the overlay.
 *
 * Word-tier entries (`"<segIdx>:<wordIdx>"`) rewrite/mute in place exactly as before.
 * Freestyle entries (`"para:<segIdx>:<wordIdx>"`, `{kind:'freetext',tokens,span}`)
 * REBUILD a whole segment's `words` from their token list, so words can be inserted
 * and deleted: survivors keep their original timing/score; inserted words get
 * interpolated timing + score 1.0. Every touched segment's `text` is rebuilt and
 * `word_segments` regenerated. With an empty overlay the result is byte-identical.
 * Throws if an anchor does not resolve to a word (loud failure beats a wrong file).
 * @param {object} original - the immutable whisperx transcript
 * @param {Object} overlay - mixed word + freetext entries
 * @returns {object} a new whisperx transcript
 */
export const projectWhisperx = (original, overlay) => {
  const out = clone(original);
  const touched = new Set(); // segIdx of segments with a rewrite or mute
  const removals = new Map(); // segIdx -> Set of wordIdx to drop
  const freeBySeg = new Map(); // segIdx -> token list (Freestyle whole-segment rebuild)

  Object.keys(overlay || {}).forEach((key) => {
    if (key === 'styles') return; // user-styling layer is dropped from faithful STT export
    const o = overlay[key];
    if (!o) return;
    if (o.kind === 'freetext') {
      const segIdx = o.span && typeof o.span.segIdx === 'number' ? o.span.segIdx : Number(key.slice('para:'.length).split(':')[0]);
      freeBySeg.set(segIdx, Array.isArray(o.tokens) ? o.tokens : []);
      return;
    }
    if (typeof o.value !== 'string' && !o.muted) return; // no-op word entry
    const sep = key.indexOf(':');
    const segIdx = Number(key.slice(0, sep));
    const wordIdx = Number(key.slice(sep + 1));
    if (freeBySeg.has(segIdx)) return; // a Freestyle rebuild owns this segment
    const seg = out.segments[segIdx];
    const segWords = seg && Array.isArray(seg.words) ? seg.words : null;
    const word = segWords ? segWords[wordIdx] : null;
    if (!word || typeof word.word !== 'string') {
      throw new Error(`projectWhisperx: overlay anchor "${key}" does not resolve to a word`);
    }
    if (o.muted) {
      if (!removals.has(segIdx)) removals.set(segIdx, new Set());
      removals.get(segIdx).add(wordIdx);
      touched.add(segIdx);
    } else {
      word.word = o.value;
      word.score = 1.0;
      touched.add(segIdx);
    }
  });

  // Apply mutes by filtering against ORIGINAL indices (so anchors stayed valid above).
  removals.forEach((set, segIdx) => {
    const seg = out.segments[segIdx];
    if (seg && Array.isArray(seg.words)) {
      seg.words = seg.words.filter((_, idx) => !set.has(idx));
    }
  });

  // Freestyle: rebuild each affected segment's words from its token list.
  freeBySeg.forEach((tokens, segIdx) => {
    const seg = out.segments[segIdx];
    if (!seg) return;
    seg.words = tokens.map((t) => whisperxWordFromToken(out, t));
    touched.add(segIdx);
  });

  // Rebuild text for every edited segment so it stays consistent with its words.
  touched.forEach((segIdx) => {
    const seg = out.segments[segIdx];
    if (seg) seg.text = rebuildSegmentText(seg);
  });

  // Regenerate the flat word list from the (possibly edited) segment words.
  out.word_segments = out.segments.reduce((acc, seg) => {
    if (Array.isArray(seg.words)) acc.push(...seg.words);
    return acc;
  }, []);

  return out;
};

/**
 * Derive a fresh overlay by diffing the editor's current Slate value against the
 * immutable model, keyed by `_key`. Identical contract to rev's `overlayFromSlate`:
 * the editor mutates leaf word objects in place (rewrite via the inline word editor,
 * mute via ctrl-click) and emits a new value; we read each word's `_key`, compare
 * text/muted to the model's base, and record patches.
 *
 * RIGID INVARIANT GUARD: the value must have exactly one word per model word (same
 * count, same keys). On any mismatch we REJECT (return null) so the caller snaps
 * back to the projected value — a count change means a structural edit leaked
 * through and the anchor mapping can no longer be trusted. Empty-words paragraphs
 * (e.g. a wordless segment) contribute zero words/keys, which is consistent because
 * they contributed zero model words too.
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

// Re-export the shared overlay edit + history helpers so consumers can import them
// from this module (parallel to how the rigid tier imports from rev-overlay).
export { setWordValue, setWordMuted, revertWord, newHistory, commit, undo, redo, canUndo, canRedo, currentOverlay, HISTORY_CAP };

export default { whisperxToModel, projectWhisperx, isWhisperxTranscript, WHISPERX_KEY };
