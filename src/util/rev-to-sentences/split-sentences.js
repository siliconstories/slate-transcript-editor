/**
 * Opt-in abbreviation-aware sentence segmenter, wrapping the bundled `sbd`.
 *
 * NOT the default for buildSentenceModel: on the reference transcript sbd
 * over-segments (e.g. it breaks on the in-word ellipsis "ich..."). Pass it
 * explicitly when you want abbreviation handling:
 *
 *   buildSentenceModel(rev, { splitter: (t) => splitSentences(t, { abbreviations }) })
 *
 * Default tokenizer options mirror the repo's existing text-segmentation
 * adapter (src/util/export-adapters/.../text-segmentation).
 */
import tokenizer from 'sbd';

/**
 * @param {string} text
 * @param {object} [opts]
 * @param {string[]} [opts.abbreviations]  language abbreviations (no trailing dots); alias `honorifics`.
 * @returns {string[]} sentence strings.
 */
const splitSentences = (text, opts = {}) => {
  const abbreviations = opts.abbreviations || opts.honorifics || null;
  return tokenizer.sentences(text, {
    newline_boundaries: true,
    html_boundaries: false,
    sanitize: false,
    allowed_tags: false,
    abbreviations,
  });
};

export default splitSentences;
