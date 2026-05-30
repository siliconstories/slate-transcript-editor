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
 * @param {Array} slateValue
 * @returns {Array} a new value with muted words removed
 */
const stripMutedWords = (slateValue) => {
  if (!Array.isArray(slateValue)) return slateValue;
  return slateValue
    .map((paragraph) => {
      const child = paragraph && Array.isArray(paragraph.children) ? paragraph.children[0] : null;
      if (!child || !Array.isArray(child.words)) return paragraph;
      const words = child.words.filter((word) => word.muted !== true);
      const text = words.map((word) => (typeof word.text === 'string' ? word.text : '')).join(' ');
      return { ...paragraph, children: [{ ...child, words, text }] };
    })
    .filter((paragraph) => {
      const child = paragraph && Array.isArray(paragraph.children) ? paragraph.children[0] : null;
      return child && Array.isArray(child.words) && child.words.length > 0;
    });
};

export default stripMutedWords;
