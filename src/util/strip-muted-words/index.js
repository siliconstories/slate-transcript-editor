/**
 * Return a copy of a Slate transcript value with all words marked `muted: true`
 * removed, and each paragraph's joined `text` regenerated to match. Paragraphs
 * that become empty are dropped.
 *
 * Used for exports (txt / docx / subtitles) where muted words must NOT appear.
 * The editor's own value keeps the muted words (with `muted: true`) so muting
 * is reversible and persists in the saved DPE JSON; only the export-time copy
 * is stripped. The input is never mutated.
 *
 * Keeping `children[0].text` in sync with `children[0].words` matters because
 * the slate->dpe round-trip rebuilds paragraphs by counting words in the text
 * (see createDpeParagraphsFromSlateJs in src/util/export-adapters/slate-to-dpe).
 *
 * Punctuation: in the rigid rev.ai tier each word carries its trailing punctuation
 * on `punctAfter` (separate from the inter-word spaces, which are the join). When a
 * muted word has trailing punctuation we keep it by moving it onto the previous kept
 * word; a muted word with only a space after it just disappears (the join collapses
 * the spacing); a sentence-initial muted word drops its punctuation entirely. Classic
 * DPE words have no `punctAfter`, so this degrades to the original bare-text join.
 *
 * @param {Array} slateValue
 * @returns {Array} a new value with muted words removed
 */
const stripMutedWords = (slateValue) => {
  if (!Array.isArray(slateValue)) return slateValue;
  return slateValue
    .map((paragraph) => {
      const child = paragraph && Array.isArray(paragraph.children) ? paragraph.children[0] : null;
      if (!child || !Array.isArray(child.words)) return paragraph;
      const kept = [];
      child.words.forEach((word) => {
        if (word.muted === true) {
          if (word.punctAfter && kept.length > 0) {
            // followed by real punctuation -> keep it, attached to the previous word
            const prev = kept[kept.length - 1];
            kept[kept.length - 1] = { ...prev, punctAfter: (prev.punctAfter || '') + word.punctAfter };
          }
          // (space-after -> just drop; sentence-initial punct -> drop punctuation too)
          return;
        }
        kept.push(word);
      });
      const text = kept.map((word) => (typeof word.text === 'string' ? word.text : '') + (word.punctAfter || '')).join(' ');
      return { ...paragraph, children: [{ ...child, words: kept, text }] };
    })
    .filter((paragraph) => {
      const child = paragraph && Array.isArray(paragraph.children) ? paragraph.children[0] : null;
      return child && Array.isArray(child.words) && child.words.length > 0;
    });
};

export default stripMutedWords;
