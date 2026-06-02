/**
 * Convert a Slate selection (or any { anchor, focus } range with { path:[pIdx,0],
 * offset }) into word-anchored style ranges — one entry per paragraph the selection
 * touches, so a cross-paragraph selection is split into per-paragraph ranges (each
 * resolvable to a single leaf at render/export time).
 *
 * Each entry: { fromKey, fromOffset, toKey, toOffset } where the offsets are WITHIN
 * the start/end word's text. Uses the SAME wordCharRanges convention as the renderer,
 * so apply→render round-trips exactly.
 */
import { wordCharRanges, paragraphWords } from '../word-char-ranges';

// The word index whose [charStart, charEnd] contains `offset` (boundary -> the word
// starting there), and the offset within that word.
const wordAtOffset = (ranges, offset) => {
  for (let i = 0; i < ranges.length; i += 1) {
    if (offset <= ranges[i].charEnd) return { wIdx: i, within: Math.max(0, offset - ranges[i].charStart) };
  }
  const last = ranges.length - 1;
  return { wIdx: last, within: last >= 0 ? ranges[last].len : 0 };
};

/**
 * @param {Array} slateValue
 * @param {{anchor:{path:number[],offset:number}, focus:{path:number[],offset:number}}} range
 * @returns {Array<{fromKey,fromOffset,toKey,toOffset}>}
 */
export const selectionToStyleRanges = (slateValue, range) => {
  if (!range || !range.anchor || !range.focus) return [];
  const a = range.anchor;
  const f = range.focus;
  // order start/end by (paragraph, offset)
  const before = a.path[0] < f.path[0] || (a.path[0] === f.path[0] && a.offset <= f.offset);
  const start = before ? a : f;
  const end = before ? f : a;

  const out = [];
  for (let pIdx = start.path[0]; pIdx <= end.path[0]; pIdx += 1) {
    const words = paragraphWords(slateValue[pIdx]);
    if (!words.length) continue;
    const ranges = wordCharRanges(words);
    const leafLen = ranges.length ? ranges[ranges.length - 1].charEnd : 0;
    const from = pIdx === start.path[0] ? start.offset : 0;
    const to = pIdx === end.path[0] ? end.offset : leafLen;
    if (to <= from) continue;
    const s = wordAtOffset(ranges, from);
    const e = wordAtOffset(ranges, Math.max(from + 1, to));
    const fromKey = words[s.wIdx] && words[s.wIdx]._key;
    const toKey = words[e.wIdx] && words[e.wIdx]._key;
    if (fromKey == null || toKey == null) continue;
    out.push({ fromKey, fromOffset: s.within, toKey, toOffset: e.within });
  }
  return out;
};

export default selectionToStyleRanges;
