/**
 * Shared helpers for the Freestyle tier, used by both the rigid (rev.ai) and
 * whisperx profiles. Kept framework-free and format-agnostic.
 */

/**
 * The original model words a paragraph owns, between two anchor keys (inclusive),
 * normalised to the shape `align-paragraph.js` expects. Confidence is taken from
 * `confidence` (rev.ai) or `score` (whisperx), whichever the model word carries.
 *
 * @param {{words:Array<{key:string,value:string,start:?number,end:?number,confidence:?number,score:?number}>}} model
 * @param {string} firstKey
 * @param {string} lastKey
 * @returns {Array<{key:string,value:string,start:?number,end:?number,confidence:?number}>}
 */
export const originalWordsBetween = (model, firstKey, lastKey) => {
  const words = (model && model.words) || [];
  const a = words.findIndex((w) => w.key === firstKey);
  if (a < 0) return [];
  const b = lastKey != null ? words.findIndex((w) => w.key === lastKey) : a;
  const end = b < 0 ? a : b;
  return words.slice(a, end + 1).map((w) => ({
    key: w.key,
    value: w.value,
    start: typeof w.start === 'number' ? w.start : null,
    end: typeof w.end === 'number' ? w.end : null,
    confidence: typeof w.confidence === 'number' ? w.confidence : typeof w.score === 'number' ? w.score : null,
  }));
};

export default { originalWordsBetween };
