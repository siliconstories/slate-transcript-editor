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
 * Edit states (confidence stays on rev.ai's native 0..1 scale):
 *   - rewritten word  -> value = newText, confidence = 1.0 (element kept in place)
 *   - untouched word  -> original value + original confidence (absent confidence stays absent)
 *   - muted word      -> REMOVED from the export, together with one adjacent punct
 *     element so the text stays clean:
 *       * followed by a space  -> drop the word + that trailing space
 *       * followed by real punctuation (.,?…) -> keep it, drop the space BEFORE the word
 *       * sentence-initial (no space before) -> also drop the trailing punctuation
 *         and its following space
 * Rewrites never remove; only muting does.
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
    const elements = mono.elements || [];
    elements.forEach((el, elemIdx) => {
      if (el && el.type === 'text') {
        // DISPLAY-ONLY: glue the punctuation that follows this word (up to the
        // next text element) so the rendered transcript reads naturally. The
        // punct elements themselves stay immutable in `original`; this never
        // enters the editable value or the overlay, so faithful export is
        // unaffected. Pure spaces trim to '' (the renderer adds its own space).
        let punctAfter = '';
        for (let j = elemIdx + 1; j < elements.length; j += 1) {
          const next = elements[j];
          if (!next || next.type === 'text') break;
          if (typeof next.value === 'string') punctAfter += next.value;
        }
        words.push({
          key: REV_KEY(monoIdx, elemIdx),
          monoIdx,
          elemIdx,
          value: typeof el.value === 'string' ? el.value : '',
          start: typeof el.ts === 'number' ? el.ts : null,
          end: typeof el.end_ts === 'number' ? el.end_ts : null,
          confidence: typeof el.confidence === 'number' ? el.confidence : null,
          hasConfidence: typeof el.confidence === 'number',
          punctAfter: punctAfter.trim(),
          speaker: mono.speaker,
        });
      }
    });
  });
  return { original, words };
};

/**
 * Faithful rev.ai export: deep-clone the frozen original and apply the overlay.
 * Rewrites set value + confidence in place; muted words are REMOVED together with
 * one adjacent punct element (see the header comment for the space/punctuation
 * rule). Removals are computed against original indices first, then applied in a
 * single filter pass so anchors stay valid while editing. Throws if an overlay
 * anchor does not resolve to a text element (loud failure beats a wrong file).
 * @param {object} original - the immutable rev.ai transcript
 * @param {Object<string,{value?:string,muted?:boolean}>} overlay
 * @returns {object} a new rev.ai transcript
 */
const LEAD_PUNCT = /^[^\p{L}\p{N}]+/u;
const TRAIL_PUNCT = /[^\p{L}\p{N}]+$/u;

/** Split a freestyle token value into leading punctuation, a bare word core, and trailing punctuation. */
const splitTokenPunct = (value) => {
  let lead = '';
  let core = String(value == null ? '' : value);
  let trail = '';
  const lm = core.match(LEAD_PUNCT);
  if (lm) {
    lead = lm[0];
    core = core.slice(lead.length);
  }
  const tm = core.match(TRAIL_PUNCT);
  if (tm) {
    trail = tm[0];
    core = core.slice(0, core.length - trail.length);
  }
  return { lead, core, trail };
};

/** Build the rev text element for one freestyle token's bare word core. */
const revTextElement = (out, token, core) => {
  if (token.ref != null) {
    const sep = token.ref.indexOf(':');
    const mi = Number(token.ref.slice(0, sep));
    const ei = Number(token.ref.slice(sep + 1));
    const orig = out.monologues[mi] && out.monologues[mi].elements ? out.monologues[mi].elements[ei] : null;
    if (orig && orig.type === 'text' && core === orig.value) return clone(orig); // unchanged: byte-faithful
    // survivor recased/respelled: keep the ORIGINAL timing, bump confidence (rewrite convention)
    const el = { type: 'text', value: core };
    if (orig && typeof orig.ts === 'number') el.ts = orig.ts;
    if (orig && typeof orig.end_ts === 'number') el.end_ts = orig.end_ts;
    el.confidence = 1.0;
    return el;
  }
  const el = { type: 'text', value: core, confidence: 1.0 };
  if (typeof token.start === 'number') el.ts = token.start;
  if (typeof token.end === 'number') el.end_ts = token.end;
  return el;
};

/** Rebuild a paragraph's rev elements from its (non-muted) freestyle tokens. */
const buildRevElements = (out, tokens, emitTrailingSpace) => {
  const live = tokens.filter((t) => !t.muted);
  const els = [];
  live.forEach((token, i) => {
    const { lead, core, trail } = splitTokenPunct(token.value);
    if (lead) els.push({ type: 'punct', value: lead });
    if (core !== '') els.push(revTextElement(out, token, core));
    if (trail) els.push({ type: 'punct', value: trail });
    if (i !== live.length - 1) els.push({ type: 'punct', value: ' ' });
  });
  if (emitTrailingSpace && live.length) els.push({ type: 'punct', value: ' ' });
  return els;
};

/** Whether the monologue has another text element after `elemEnd` (i.e. a following paragraph). */
const hasTextElementAfter = (out, monoIdx, elemEnd) => {
  const els = out.monologues[monoIdx] && out.monologues[monoIdx].elements;
  if (!Array.isArray(els)) return false;
  for (let i = elemEnd + 1; i < els.length; i += 1) if (els[i] && els[i].type === 'text') return true;
  return false;
};

/**
 * Faithful rev.ai export. Word-tier entries (`"<monoIdx>:<elemIdx>"`) rewrite/mute
 * in place exactly as before. Freestyle entries (`"para:<monoIdx>:<elemIdx>"`,
 * `{kind:'freetext',tokens,span}`) REBUILD a paragraph's element sub-array from its
 * token list (so words can be inserted/deleted): survivors keep their original
 * timing (+confidence when truly unchanged), inserted words get interpolated timing
 * + confidence 1.0, punctuation is split back into `punct` elements, and a single
 * space separates words. Splices are computed against ORIGINAL indices and applied
 * right-to-left per monologue so earlier anchors stay valid. Untouched paragraphs are
 * never rebuilt → byte-identical. Throws if a word-tier anchor does not resolve.
 */
export const projectRev = (original, overlay) => {
  const out = clone(original);
  const isPunct = (e) => Boolean(e) && e.type === 'punct';
  const isSpace = (e) => isPunct(e) && e.value === ' ';
  const removals = new Map(); // monoIdx -> Set of element indices to drop
  const markRemoval = (monoIdx, idx) => {
    if (!removals.has(monoIdx)) removals.set(monoIdx, new Set());
    removals.get(monoIdx).add(idx);
  };
  const splices = new Map(); // monoIdx -> [{elemStart, elemEnd, els}]
  const freetextMonos = new Set();

  // Pass 1: build Freestyle element replacements from the pristine clone (before any mutation).
  Object.keys(overlay || {}).forEach((key) => {
    if (key === 'styles') return; // user-styling layer is dropped from faithful STT export
    const o = overlay[key];
    if (!o || o.kind !== 'freetext') return;
    const span = o.span || {};
    const monoIdx = typeof span.monoIdx === 'number' ? span.monoIdx : Number(key.slice('para:'.length).split(':')[0]);
    const elemStart = typeof span.elemStart === 'number' ? span.elemStart : null;
    const elemEnd = typeof span.elemEnd === 'number' ? span.elemEnd : null;
    if (elemStart == null || elemEnd == null) return;
    freetextMonos.add(monoIdx);
    const els = buildRevElements(out, Array.isArray(o.tokens) ? o.tokens : [], hasTextElementAfter(out, monoIdx, elemEnd));
    if (!splices.has(monoIdx)) splices.set(monoIdx, []);
    splices.get(monoIdx).push({ elemStart, elemEnd, els });
  });

  // Pass 2: word-tier rewrites + mutes (skip monologues owned by a Freestyle rebuild).
  Object.keys(overlay || {}).forEach((key) => {
    if (key === 'styles') return; // user-styling layer is dropped from faithful STT export
    const o = overlay[key];
    if (!o || o.kind === 'freetext' || (typeof o.value !== 'string' && !o.muted)) return; // no-op / freetext
    const sep = key.indexOf(':');
    const monoIdx = Number(key.slice(0, sep));
    const elemIdx = Number(key.slice(sep + 1));
    if (freetextMonos.has(monoIdx)) return;
    const mono = out.monologues[monoIdx];
    const elements = mono && Array.isArray(mono.elements) ? mono.elements : null;
    const el = elements ? elements[elemIdx] : null;
    if (!el || el.type !== 'text') {
      throw new Error(`projectRev: overlay anchor "${key}" does not resolve to a text element`);
    }
    if (o.muted) {
      // drop the word + one adjacent punct so the export reads cleanly
      markRemoval(monoIdx, elemIdx);
      const afterEl = elements[elemIdx + 1];
      const beforeEl = elements[elemIdx - 1];
      if (isSpace(afterEl)) {
        markRemoval(monoIdx, elemIdx + 1); // followed by a space -> drop that space
      } else if (isSpace(beforeEl)) {
        markRemoval(monoIdx, elemIdx - 1); // followed by punctuation -> drop the space before, keep the punct
      } else if (isPunct(afterEl)) {
        // sentence-initial (no space before): drop the trailing punct + its space too
        markRemoval(monoIdx, elemIdx + 1);
        if (isSpace(elements[elemIdx + 2])) markRemoval(monoIdx, elemIdx + 2);
      }
    } else {
      el.value = o.value;
      el.confidence = 1.0;
    }
  });

  removals.forEach((set, monoIdx) => {
    const mono = out.monologues[monoIdx];
    if (mono && Array.isArray(mono.elements)) {
      mono.elements = mono.elements.filter((_, idx) => !set.has(idx));
    }
  });

  // Apply Freestyle splices right-to-left so earlier element indices stay valid.
  splices.forEach((list, monoIdx) => {
    const mono = out.monologues[monoIdx];
    if (!mono || !Array.isArray(mono.elements)) return;
    list.sort((a, b) => b.elemStart - a.elemStart);
    list.forEach(({ elemStart, elemEnd, els }) => {
      mono.elements.splice(elemStart, elemEnd - elemStart + 1, ...els);
    });
  });

  return out;
};

// ---- overlay edit helpers + snapshot history ----
// These are format-agnostic (they operate on a sparse overlay keyed by an anchor
// string, with no rev.ai knowledge), so they live in `overlay-history.js` and are
// shared with the whisperx tier. Re-exported here to keep this module's existing
// import surface unchanged.
export {
  setWordValue,
  setWordMuted,
  revertWord,
  HISTORY_CAP,
  newHistory,
  commit,
  canUndo,
  canRedo,
  undo,
  redo,
  currentOverlay,
} from './overlay-history';

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
