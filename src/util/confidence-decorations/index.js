/**
 * Build the per-paragraph confidence "heat" decorations for the Slate editor.
 *
 * Returns ranges (NOT marks) so they never enter the document model — typing,
 * selection and undo are unaffected, and the set re-derives whenever `value` or
 * the confidence settings change (never on caret/time ticks).
 *
 * - WORD mode: one decoration per BELOW-cutoff word (adjacent equal-band words,
 *   including the joining space, are coalesced into a single range — so a clean
 *   transcript produces a near-empty map).
 * - SENTENCE mode: each paragraph's words are grouped into sentences (shared
 *   terminal-split rule), every word in a low-confidence sentence gets one
 *   uniform wash spanning the sentence.
 *
 * Char offsets MUST mirror buildWordMap / generateText: `words.map(w=>w.text).join(' ')`.
 */
import { confidenceToStyle, confidenceBand } from '../confidence-scale';
import { confidenceOf, groupSlateWordsIntoSentences } from '../rev-to-sentences';

const paragraphWords = (paragraph) => {
  const child = paragraph && Array.isArray(paragraph.children) ? paragraph.children[0] : null;
  return child && Array.isArray(child.words) ? child.words : null;
};

const hasAnyConfidence = (slateValue) =>
  Array.isArray(slateValue) &&
  slateValue.some((p) => {
    const words = paragraphWords(p);
    return Array.isArray(words) && words.some((w) => typeof w.confidence === 'number');
  });

// Per-word char ranges inside the paragraph's single text leaf (text + one space).
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

/**
 * @param {Array} slateValue  the Slate document (paragraphs with children[0].words)
 * @param {object} settings   { overlay, level:'word'|'sentence', cutoff, floor,
 *                              sentenceMetric:'mean'|'duration_weighted', highlightOpacity }
 * @returns {{ enabled:boolean, byPara: Array<Array<{charStart,charEnd,confidenceStyle,confidenceBand}>> }}
 */
export const buildConfidenceDecorations = (slateValue, settings) => {
  const empty = { enabled: false, byPara: [] };
  if (!settings || settings.overlay === false) return empty;
  if (!Array.isArray(slateValue) || slateValue.length === 0) return empty;
  if (!hasAnyConfidence(slateValue)) return empty; // classic DPE => no-op

  const { level = 'word', cutoff = 0.85, floor = 0.55, sentenceMetric = 'mean', highlightOpacity = 0.5 } = settings;
  const styleOpts = { cutoff, floor, highlightOpacity };
  const metricIdx = sentenceMetric === 'duration_weighted' ? 1 : 0;

  const byPara = slateValue.map((paragraph) => {
    const words = paragraphWords(paragraph);
    if (!Array.isArray(words) || words.length === 0) return [];
    const ranges = wordCharRanges(words);
    const decos = [];

    if (level === 'sentence') {
      groupSlateWordsIntoSentences(words).forEach(({ wIdxStart, wIdxEnd, words: sWords }) => {
        const conf = confidenceOf(sWords)[metricIdx];
        const style = confidenceToStyle(conf, styleOpts);
        if (!style) return;
        const charStart = ranges[wIdxStart].charStart;
        const charEnd = ranges[wIdxEnd].charEnd;
        if (charEnd > charStart) decos.push({ charStart, charEnd, confidenceStyle: style, confidenceBand: confidenceBand(conf, styleOpts) });
      });
      return decos;
    }

    // WORD mode — only below-cutoff words, coalescing adjacent equal-band runs.
    let pending = null;
    const flush = () => {
      if (pending) decos.push(pending);
      pending = null;
    };
    words.forEach((w, i) => {
      const { charStart, charEnd, len } = ranges[i];
      if (len === 0) return; // empty alignment placeholder — nothing to paint
      const style = confidenceToStyle(w.confidence, styleOpts);
      if (!style) {
        flush();
        return;
      }
      const band = confidenceBand(w.confidence, styleOpts);
      if (pending && pending.confidenceBand === band && pending.charEnd + 1 === charStart) {
        pending.charEnd = charEnd; // merge with the joining space
      } else {
        flush();
        pending = { charStart, charEnd, confidenceStyle: style, confidenceBand: band };
      }
    });
    flush();
    return decos;
  });

  return { enabled: true, byPara };
};

export default buildConfidenceDecorations;
