/**
 * Post-process a projected Slate value to (1) STAMP every paragraph with the stable
 * identity the Freestyle tier needs — `anchorKey` (its first original word key) and
 * `span` (the original element/word range it owns) — and (2) SWAP the leaf words of
 * any paragraph that has a `para:<firstKey>` freetext overlay entry for that entry's
 * aligned tokens (so inserted/deleted words render with their interpolated/estimated
 * timing). Untouched paragraphs keep their word-overlay leaves; they are only stamped.
 *
 * Runs for BOTH tiers on top of their existing projection (rigid's DPE round-trip and
 * whisperx's direct projection), so neither base path changes. The span shape is
 * detected from the model word fields: rev words carry `monoIdx`/`elemIdx`, whisperx
 * words carry `segIdx`.
 */
import { shortTimecode } from '../util/timecode-converter';
import generatePreviousTimingsUpToCurrent from '../util/dpe-to-slate/generate-previous-timings-up-to-current';

const num = (n, fallback) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

const firstKeyOf = (words) => {
  for (const w of words) if (w._key != null) return w._key;
  return null;
};
const lastKeyOf = (words) => {
  for (let i = words.length - 1; i >= 0; i -= 1) if (words[i]._key != null) return words[i]._key;
  return null;
};

/** The original element/word range a paragraph owns, derived from the model word fields. */
const spanFor = (wordByKey, model, firstKey, lastKey, nextFirstKey) => {
  const fw = wordByKey.get(firstKey);
  const base = { firstWordKey: firstKey, lastWordKey: lastKey };
  if (!fw) return base;
  if (typeof fw.segIdx === 'number') return { ...base, segIdx: fw.segIdx }; // whisperx: paragraph == segment
  // rev: own elements from this paragraph's first word up to just before the next paragraph's first word
  const monoIdx = fw.monoIdx;
  const nw = nextFirstKey != null ? wordByKey.get(nextFirstKey) : null;
  const monoElements = model.original && model.original.monologues[monoIdx] && model.original.monologues[monoIdx].elements;
  const elemEnd = nw && nw.monoIdx === monoIdx ? nw.elemIdx - 1 : Array.isArray(monoElements) ? monoElements.length - 1 : fw.elemIdx;
  return { ...base, monoIdx, elemStart: fw.elemIdx, elemEnd };
};

/** Turn a freestyle token into a Slate leaf word (carries `timingSource` for provenance). */
export const tokenToLeafWord = (token, speaker) => {
  const start = num(token.start, 0);
  return {
    _key: token.ref != null ? token.ref : null,
    start,
    end: num(token.end, start),
    text: token.value,
    confidence: typeof token.confidence === 'number' ? token.confidence : null,
    muted: token.muted === true,
    estimated: token.estimated === true || token.ref == null,
    timingSource: token.ref != null && token.estimated !== true ? 'original' : 'interpolated',
    speaker,
    punctAfter: '',
  };
};

/**
 * @param {Array} slateValue - the base projection (word-overlay leaves)
 * @param {{original:object, words:Array}} model
 * @param {Object} overlay - the current overlay (may contain `para:` freetext entries)
 * @returns {Array} the same paragraphs, stamped + freetext-applied
 */
export const applyFreetextOverlay = (slateValue, model, overlay) => {
  const wordByKey = new Map((model.words || []).map((w) => [w.key, w]));
  const value = Array.isArray(slateValue) ? slateValue : [];

  return value.map((para, i) => {
    const words = (para.children && para.children[0] && para.children[0].words) || [];
    const firstKey = firstKeyOf(words);
    if (firstKey == null) return para; // anchorless (e.g. whisperx wordless segment) — leave untouched

    const lastKey = lastKeyOf(words) || firstKey;
    const nextWords = (value[i + 1] && value[i + 1].children && value[i + 1].children[0] && value[i + 1].children[0].words) || [];
    const span = spanFor(wordByKey, model, firstKey, lastKey, firstKeyOf(nextWords));

    let next = { ...para, anchorKey: firstKey, span };

    const entry = overlay && overlay[`para:${firstKey}`];
    if (entry && entry.kind === 'freetext') {
      const leafWords = (entry.tokens || []).map((t) => tokenToLeafWord(t, para.speaker));
      const text = leafWords.map((w) => w.text).join(' ');
      const start = leafWords.length ? num(leafWords[0].start, next.start) : next.start;
      next = {
        ...next,
        start,
        startTimecode: shortTimecode(start),
        previousTimings: generatePreviousTimingsUpToCurrent(start),
        children: [{ ...para.children[0], text, words: leafWords }],
      };
    }
    return next;
  });
};

export default applyFreetextOverlay;
