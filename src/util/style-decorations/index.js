/**
 * Build the per-paragraph user-styling decorations (bold / italic / underline /
 * highlight / note) for the Slate editor. Like confidence + provenance, these are
 * Slate DECORATIONS (ranges, not marks): they never enter the document model, never
 * trigger normalization, and compose with the other decoration sources on the same
 * leaf. Styling therefore physically cannot corrupt word/timing data.
 *
 * A style range is anchored to stable word ids: { id, fromKey, fromOffset, toKey,
 * toOffset, mark }. `fromOffset`/`toOffset` are offsets WITHIN that word's text (so a
 * mark may start/end mid-word). Cross-paragraph ranges are split at apply time, so
 * every stored range resolves to a single paragraph here. Unresolved anchors (e.g. a
 * word deleted in Loose mode) are skipped — the data is repaired on the next commit.
 *
 * Char offsets MUST mirror wordCharRanges: leaf text = words.map(w => w.text).join(' ').
 */
import { wordCharRanges, paragraphWords } from '../word-char-ranges';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * @param {Array} slateValue
 * @param {Array<{id,fromKey,fromOffset,toKey,toOffset,mark}>} styleRanges
 * @returns {{ enabled:boolean, byPara: Array<Array<{charStart,charEnd,mark,id}>> }}
 */
export const buildStyleDecorations = (slateValue, styleRanges) => {
  const empty = { enabled: false, byPara: [] };
  if (!Array.isArray(slateValue) || slateValue.length === 0) return empty;
  if (!Array.isArray(styleRanges) || styleRanges.length === 0) return empty;

  // _key -> { pIdx, charStart, charEnd } across the whole document.
  const keyIndex = new Map();
  slateValue.forEach((para, pIdx) => {
    const words = paragraphWords(para);
    const ranges = wordCharRanges(words);
    words.forEach((w, wIdx) => {
      if (w._key != null) keyIndex.set(w._key, { pIdx, charStart: ranges[wIdx].charStart, charEnd: ranges[wIdx].charEnd });
    });
  });

  const byPara = slateValue.map(() => []);
  let enabled = false;
  styleRanges.forEach((sr) => {
    const from = keyIndex.get(sr.fromKey);
    const to = keyIndex.get(sr.toKey);
    if (!from || !to || from.pIdx !== to.pIdx) return; // unresolved or cross-paragraph -> skip
    const fromLen = from.charEnd - from.charStart;
    const toLen = to.charEnd - to.charStart;
    const charStart = from.charStart + clamp(typeof sr.fromOffset === 'number' ? sr.fromOffset : 0, 0, fromLen);
    const charEnd = to.charStart + clamp(typeof sr.toOffset === 'number' ? sr.toOffset : toLen, 0, toLen);
    if (charEnd <= charStart) return;
    enabled = true;
    byPara[from.pIdx].push({ charStart, charEnd, mark: sr.mark, id: sr.id });
  });
  return { enabled, byPara };
};

export default buildStyleDecorations;
