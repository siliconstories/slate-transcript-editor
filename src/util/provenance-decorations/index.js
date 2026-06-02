/**
 * Build per-paragraph "estimated timing" decorations for the Freestyle editor.
 *
 * In Freestyle mode words that survived a diff keep their exact audio timestamp,
 * while newly inserted words get an INTERPOLATED (estimated) timestamp. This marks
 * those estimated words with a `provenance:'estimated'` range so `renderLeaf` can
 * give them a dotted underline — a visual cue that their timing is not from audio.
 *
 * Returns ranges (NOT marks) so they never enter the document; re-derives only when
 * `value` changes (never on caret/time ticks). Char offsets MUST mirror
 * buildWordMap / buildConfidenceDecorations: `words.map(w=>w.text).join(' ')`.
 */

const paragraphWords = (paragraph) => {
  const child = paragraph && Array.isArray(paragraph.children) ? paragraph.children[0] : null;
  return child && Array.isArray(child.words) ? child.words : null;
};

const wordCharRanges = (words) => {
  const ranges = [];
  let offset = 0;
  words.forEach((w, i) => {
    const text = typeof w.text === 'string' ? w.text : '';
    const charStart = offset;
    const charEnd = offset + text.length;
    ranges.push({ charStart, charEnd, len: text.length });
    offset = charEnd + (i < words.length - 1 ? 1 : 0);
  });
  return ranges;
};

const isEstimated = (w) => w._key == null || (typeof w.timingSource === 'string' && w.timingSource !== 'original') || w.estimated === true;

/**
 * @param {Array} slateValue
 * @returns {{ enabled:boolean, byPara: Array<Array<{charStart,charEnd,provenance:'estimated'}>> }}
 */
export const buildProvenanceDecorations = (slateValue) => {
  const empty = { enabled: false, byPara: [] };
  if (!Array.isArray(slateValue) || slateValue.length === 0) return empty;
  let enabled = false;
  const byPara = slateValue.map((paragraph) => {
    const words = paragraphWords(paragraph);
    if (!Array.isArray(words) || words.length === 0) return [];
    const ranges = wordCharRanges(words);
    const decos = [];
    words.forEach((w, i) => {
      if (!isEstimated(w)) return;
      const { charStart, charEnd, len } = ranges[i];
      if (len === 0) return;
      enabled = true;
      decos.push({ charStart, charEnd, provenance: 'estimated' });
    });
    return decos;
  });
  return { enabled, byPara };
};

export default buildProvenanceDecorations;
