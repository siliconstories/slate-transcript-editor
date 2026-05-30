/**
 * Build a flat, time-ordered map of every word in a Slate transcript value,
 * with the character offsets it occupies inside its paragraph's text leaf.
 *
 * It mirrors how `generateText` (src/util/dpe-to-slate/index.js) joins a
 * paragraph's words: `words.map(w => w.text).join(' ')`. So word N starts at
 * the running offset and the separator between words is exactly one space.
 *
 * Each Slate paragraph here looks like:
 *   { type:'timedText', start, ...,
 *     children: [ { text: '<joined words>', words: [{start,end,text}, ...] } ] }
 *
 * @param {Array} slateValue - the Slate document (array of paragraph nodes)
 * @returns {Array<{pIdx:number, path:number[], charStart:number, charEnd:number, start:number, end:number}>}
 *   one entry per word, in document order. `path` is the Slate path to the
 *   text leaf ([paragraphIndex, 0]). `start`/`end` are seconds. To feel
 *   gapless, callers may treat a word as active until the next word's `start`.
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
      map.push({
        pIdx,
        path: [pIdx, 0],
        charStart,
        charEnd,
        start: typeof word.start === 'number' ? word.start : 0,
        end: typeof word.end === 'number' ? word.end : 0,
      });
      // advance past this word + the single space `join(' ')` inserts between words
      offset = charEnd + (wIdx < words.length - 1 ? 1 : 0);
    });
  });

  return map;
};

export default buildWordMap;
