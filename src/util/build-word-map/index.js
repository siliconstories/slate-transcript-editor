/**
 * Build a flat map of every (non-empty) word in a Slate transcript value, with
 * the character offsets it occupies inside its paragraph's text leaf, sorted by
 * start time so it can be binary-searched by playback position.
 *
 * Character offsets mirror how `generateText` (src/util/dpe-to-slate/index.js)
 * joins a paragraph's words: `words.map(w => w.text).join(' ')`. So word N
 * starts at the running offset and the separator between words is one space.
 *
 * Two robustness details for real-world DPE data:
 *  - Empty-text words (alignment placeholders) are skipped: they have a
 *    zero-width range that cannot be highlighted, and would only flicker the
 *    highlight off for a tick. Their offset is still consumed so the following
 *    words stay aligned with the joined text.
 *  - The result is sorted ascending by `start`. DPE word lists are not always
 *    strictly time-ordered (placeholders and re-aligned words can be out of
 *    order), and findActiveWord binary-searches on `start`, so the map must be
 *    sorted for the active-word lookup to be correct.
 *
 * Each Slate paragraph here looks like:
 *   { type:'timedText', start, ...,
 *     children: [ { text: '<joined words>', words: [{start,end,text}, ...] } ] }
 *
 * @param {Array} slateValue - the Slate document (array of paragraph nodes)
 * @returns {Array<{pIdx:number, path:number[], charStart:number, charEnd:number, start:number, end:number}>}
 *   one entry per visible word, sorted by `start`. `path` is the Slate path to
 *   the text leaf ([paragraphIndex, 0]); `start`/`end` are seconds.
 */
const buildWordMap = (slateValue) => {
  const map = [];
  if (!Array.isArray(slateValue)) return map;

  slateValue.forEach((paragraph, pIdx) => {
    const child = paragraph && Array.isArray(paragraph.children) ? paragraph.children[0] : null;
    const words = child && Array.isArray(child.words) ? child.words : [];
    let offset = 0;
    words.forEach((word, wIdx) => {
      const text = typeof word.text === 'string' ? word.text : '';
      const charStart = offset;
      const charEnd = offset + text.length;
      if (text.length > 0) {
        map.push({
          pIdx,
          path: [pIdx, 0],
          charStart,
          charEnd,
          start: typeof word.start === 'number' ? word.start : 0,
          end: typeof word.end === 'number' ? word.end : 0,
        });
      }
      // advance past this word + the single space `join(' ')` inserts between words
      offset = charEnd + (wIdx < words.length - 1 ? 1 : 0);
    });
  });

  map.sort((a, b) => a.start - b.start);
  return map;
};

export default buildWordMap;
