/**
 * Freestyle (paragraph-level free-text) overlay derivation — format-agnostic.
 *
 * Where the Word tier records a sparse `{anchor: {value?, muted?}}` overlay and
 * forbids word-count changes, the Freestyle tier records a richer entry PER EDITED
 * PARAGRAPH that CAN add/remove words:
 *
 *   overlay["para:<firstWordKey>"] = {
 *     kind: 'freetext',
 *     tokens: [ { ref:<anchor>|null, value, start, end, confidence, estimated, muted } ],
 *     span:   { firstWordKey, lastWordKey, ...formatSpecific }   // for the projector
 *   }
 *
 * A token with `ref` is a surviving original word (kept timing + faithful export);
 * a token with `ref:null` is a newly inserted word (interpolated timing). The
 * aligned tokens are produced by `align-paragraph.js` and written onto the Slate
 * leaf `words[]` at edit time; this module just READS them back off the value and
 * validates that the result is a well-formed, projectable overlay.
 *
 * Each paragraph node must carry the stable identity stamped by the to-slate
 * projector: `anchorKey` (the first ORIGINAL word key the paragraph owns) and
 * `span` (at least `firstWordKey`/`lastWordKey`, so deletions at a paragraph edge
 * are detectable and the projector knows which original range to rebuild).
 *
 * Coexists with Word-tier `{value,muted}` entries in the same overlay/history;
 * `projectRev`/`projectWhisperx` dispatch on `entry.kind`.
 */

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** Map every model word key to its flat index (for ordering + span slicing). */
const indexByKey = (model) => {
  const m = new Map();
  (model.words || []).forEach((w, i) => m.set(w.key, i));
  return m;
};

/** The paragraph's identity + original span, from the stamped fields (with a survivor fallback). */
const paragraphSpan = (para) => {
  const words = (para && para.children && para.children[0] && para.children[0].words) || [];
  const span = (para && para.span) || null;
  const survivors = words.filter((w) => w._key != null);
  const firstWordKey = (span && span.firstWordKey) || para.anchorKey || (survivors[0] && survivors[0]._key) || null;
  const lastWordKey = (span && span.lastWordKey) || (survivors.length ? survivors[survivors.length - 1]._key : firstWordKey);
  return { firstWordKey, lastWordKey, span };
};

/** Read a paragraph's leaf words[] into the canonical token shape. */
const tokensOf = (para) => {
  const words = (para && para.children && para.children[0] && para.children[0].words) || [];
  return words.map((w) => ({
    ref: w._key != null ? w._key : null,
    value: typeof w.text === 'string' ? w.text : '',
    start: num(w.start),
    end: num(w.end),
    confidence: typeof w.confidence === 'number' ? w.confidence : null,
    estimated: w.estimated === true || w._key == null,
    muted: w.muted === true,
  }));
};

/** True when the paragraph still matches its original model words exactly (clean → no entry). */
const isUnchanged = (tokens, expected) => {
  if (tokens.length !== expected.length) return false;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const e = expected[i];
    if (t.ref !== e.key || t.value !== e.value || t.muted || t.estimated) return false;
  }
  return true;
};

/**
 * Derive the Freestyle overlay by reading the aligned `words[]` off each paragraph
 * of the Slate value. Returns `null` (caller snaps back to `reproject()`) when the
 * value is structurally corrupt — an unknown/duplicate/out-of-order survivor anchor,
 * which means an edit slipped past the single-leaf invariant.
 *
 * @param {{words:Array<{key:string,value:string}>}} model
 * @param {Array} slateValue
 * @returns {Object|null}
 */
export const freeTextOverlayFromSlate = (model, slateValue) => {
  const idx = indexByKey(model);
  const overlay = {};
  const usedRefs = new Set();
  let lastRefIdx = -1;

  for (const para of slateValue || []) {
    const { firstWordKey, lastWordKey } = paragraphSpan(para);
    if (firstWordKey == null) continue; // anchorless paragraph (e.g. whisperx empty-words segment) — read-only

    const tokens = tokensOf(para);

    // Validate surviving anchors: known, unique, strictly increasing in model order.
    for (const t of tokens) {
      if (t.ref == null) continue;
      const refIdx = idx.get(t.ref);
      if (refIdx === undefined || usedRefs.has(t.ref) || refIdx <= lastRefIdx) return null;
      usedRefs.add(t.ref);
      lastRefIdx = refIdx;
    }

    const firstIdx = idx.get(firstWordKey);
    const lastIdx = idx.get(lastWordKey);
    const expected = firstIdx !== undefined && lastIdx !== undefined ? model.words.slice(firstIdx, lastIdx + 1) : null;
    if (expected && isUnchanged(tokens, expected)) continue; // clean paragraph emits nothing

    overlay[`para:${firstWordKey}`] = { kind: 'freetext', tokens, span: (para && para.span) || { firstWordKey, lastWordKey } };
  }

  return overlay;
};

export default { freeTextOverlayFromSlate };
