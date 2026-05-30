/**
 * Convert a rev.ai transcript JSON into the Digital Paper Edit (DPE) shape
 * consumed by SlateTranscriptEditor.
 *
 * rev.ai shape:
 *   { monologues: [ { speaker: <number|string>, elements: [
 *       { type: 'text',  value, ts, end_ts, confidence },
 *       { type: 'punct', value }            // ' ' between words, or '.' ',' '?' ...
 *   ] } ] }
 *
 * DPE shape:
 *   { words:      [ { id, start, end, text } ],
 *     paragraphs: [ { id, start, end, speaker } ] }
 *
 * DPE contract (see src/util/dpe-to-slate/index.js): a word belongs to a
 * paragraph when `word.start >= paragraph.start && word.end <= paragraph.end`.
 * rev.ai elements are time-ordered, so as long as each paragraph.end is its
 * last word's end_ts (which is what we emit) the paragraph ranges are
 * contiguous and non-overlapping.
 */

const SENTENCE_END = /[.?!…]$/;
const DEFAULT_WORDS_PER_PARAGRAPH = 40;

const isFiniteNumber = (n) => typeof n === 'number' && isFinite(n);

/**
 * @param {*} obj
 * @returns {boolean} true if `obj` looks like a rev.ai transcript
 */
export const isRevTranscript = (obj) => Boolean(obj) && typeof obj === 'object' && Array.isArray(obj.monologues);

const speakerLabel = (speaker) => {
  if (typeof speaker === 'number' && isFinite(speaker)) return `Speaker ${speaker + 1}`;
  if (typeof speaker === 'string' && speaker.trim() !== '') {
    const asNum = Number(speaker);
    return Number.isInteger(asNum) ? `Speaker ${asNum + 1}` : speaker;
  }
  return 'Speaker 1';
};

/**
 * Build the flat word list for one monologue, gluing non-whitespace
 * punctuation onto the preceding word ("werden" + "." -> "werden.").
 * Caveat: an opening quote (") also glues to the previous word rather than the
 * next one. This is cosmetic and acceptable for editing/export.
 * @returns {Array<{start:number,end:number,text:string}>}
 */
const wordsForMonologue = (elements) => {
  const words = [];
  let current = null;
  (elements || []).forEach((el) => {
    if (el.type === 'text' && isFiniteNumber(el.ts) && isFiniteNumber(el.end_ts)) {
      current = { start: el.ts, end: el.end_ts, text: typeof el.value === 'string' ? el.value : '' };
      words.push(current);
    } else if (el.type === 'punct' && typeof el.value === 'string' && el.value.trim() !== '' && current) {
      current.text += el.value;
    }
  });
  return words;
};

/**
 * Convert a rev.ai transcript to DPE.
 * @param {object} revJson - parsed rev.ai JSON
 * @param {object} [options]
 * @param {number} [options.wordsPerParagraph=40] - target paragraph length; a
 *   paragraph is closed at the first sentence end at or after this many words.
 * @returns {{words: Array, paragraphs: Array}}
 */
const convertRevToDpe = (revJson, options = {}) => {
  if (!isRevTranscript(revJson)) {
    throw new Error('Not a rev.ai transcript: expected a top-level "monologues" array.');
  }
  const wordsPerParagraph =
    isFiniteNumber(options.wordsPerParagraph) && options.wordsPerParagraph > 0 ? options.wordsPerParagraph : DEFAULT_WORDS_PER_PARAGRAPH;
  const hardLimit = Math.ceil(wordsPerParagraph * 1.5);

  const words = [];
  const paragraphs = [];
  let wordId = 0;
  let paragraphId = 0;

  revJson.monologues.forEach((monologue) => {
    const speaker = speakerLabel(monologue.speaker);
    const monologueWords = wordsForMonologue(monologue.elements);
    if (monologueWords.length === 0) return;

    let buffer = [];
    const flush = () => {
      if (buffer.length === 0) return;
      const start = buffer[0].start;
      const end = buffer[buffer.length - 1].end;
      buffer.forEach((w) => {
        words.push({ id: wordId++, start: w.start, end: w.end, text: w.text });
      });
      paragraphs.push({ id: paragraphId++, start, end, speaker });
      buffer = [];
    };

    monologueWords.forEach((w) => {
      buffer.push(w);
      const endsSentence = SENTENCE_END.test(w.text);
      if ((endsSentence && buffer.length >= wordsPerParagraph) || buffer.length >= hardLimit) {
        flush();
      }
    });
    flush(); // close remainder of this speaker turn
  });

  return { words, paragraphs };
};

export default convertRevToDpe;
