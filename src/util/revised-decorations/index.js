/**
 * Build the per-paragraph "track changes" decorations — marks every word that has been
 * REVISED against the immutable original, so the user can see edits at a glance:
 *   - 'muted'     → the word was muted (struck through, dropped on export)
 *   - 'inserted'  → a Loose free-text insertion (estimated timing, no original anchor)
 *   - 'rewritten' → the word's text was changed (its anchor is in the word-tier overlay)
 *
 * Like the other overlays these are Slate DECORATIONS (ranges, not marks): they never
 * enter the document model. Char offsets mirror the shared wordCharRanges convention.
 */
import { wordCharRanges, paragraphWords } from '../word-char-ranges';

/**
 * @param {Array} slateValue
 * @param {Set<string>} rewrittenKeys  word anchors that carry a text rewrite in the overlay
 * @returns {{ enabled:boolean, byPara: Array<Array<{charStart,charEnd,revised}>> }}
 */
export const buildRevisedDecorations = (slateValue, rewrittenKeys) => {
  const empty = { enabled: false, byPara: [] };
  if (!Array.isArray(slateValue) || slateValue.length === 0) return empty;
  const keys = rewrittenKeys instanceof Set ? rewrittenKeys : new Set();
  let enabled = false;
  const byPara = slateValue.map((paragraph) => {
    const words = paragraphWords(paragraph);
    if (!words.length) return [];
    const ranges = wordCharRanges(words);
    const decos = [];
    words.forEach((w, i) => {
      if (ranges[i].len === 0) return;
      let revised = null;
      if (w.muted === true) revised = 'muted';
      else if (w.estimated === true || w._key == null) revised = 'inserted';
      else if (w._key != null && keys.has(w._key)) revised = 'rewritten';
      if (!revised) return;
      enabled = true;
      decos.push({ charStart: ranges[i].charStart, charEnd: ranges[i].charEnd, revised });
    });
    return decos;
  });
  return { enabled, byPara };
};

export default buildRevisedDecorations;
