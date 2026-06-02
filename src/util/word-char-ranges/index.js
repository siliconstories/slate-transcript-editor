/**
 * THE single source of truth for mapping a paragraph's leaf words to their character
 * ranges inside the leaf's text. Every decoration builder + selection resolver MUST
 * use this so they all agree on offsets — the leaf text is ALWAYS
 * `words.map(w => w.text).join(' ')`, so word i occupies [offset, offset+len) and a
 * single joining space follows every word except the last.
 *
 * @param {Array<{text?:string}>} words
 * @returns {Array<{charStart:number, charEnd:number, len:number}>}
 */
export const wordCharRanges = (words) => {
  const ranges = [];
  let offset = 0;
  (words || []).forEach((w, i) => {
    const text = typeof w.text === 'string' ? w.text : '';
    const charStart = offset;
    const charEnd = offset + text.length;
    ranges.push({ charStart, charEnd, len: text.length });
    offset = charEnd + (i < words.length - 1 ? 1 : 0);
  });
  return ranges;
};

/** The leaf words of a Slate paragraph (or [] if it carries none). */
export const paragraphWords = (paragraph) => {
  const child = paragraph && Array.isArray(paragraph.children) ? paragraph.children[0] : null;
  return child && Array.isArray(child.words) ? child.words : [];
};

export default wordCharRanges;
