/**
 * Build the editor's Slate value for the RIGID (rev.ai / scientific) tier.
 *
 * Unlike the classic path (rev -> DPE -> slate, which glues punctuation into
 * words and drops confidence), this projects DIRECTLY from the immutable model's
 * word list so every editable word carries a stable `_key` (anchor back to the
 * original element) plus its `confidence`. Word count per paragraph is FIXED:
 * the rigid tier only mutes/rewrites, never adds/splits/merges, so the anchors
 * stay valid for faithful export.
 *
 * Slate paragraph shape (matches src/util/dpe-to-slate output):
 *   { type:'timedText', speaker, start, previousTimings, startTimecode,
 *     children:[{ text:'<words joined by space>', words:[ word objs ] }] }
 *
 * The `words` carried on the leaf are NEW objects each projection (so a remount
 * re-stamps `_key`; we never rely on by-reference survival across remounts).
 */
import { shortTimecode } from '../util/timecode-converter';
import generatePreviousTimingsUpToCurrent from '../util/dpe-to-slate/generate-previous-timings-up-to-current';
import { currentOverlay } from './rev-overlay.js';

const SENTENCE_END = /[.?!…]$/;
const DEFAULT_WORDS_PER_PARAGRAPH = 40;

const speakerLabel = (speaker) => {
  if (typeof speaker === 'number' && isFinite(speaker)) return `Speaker ${speaker + 1}`;
  if (typeof speaker === 'string' && speaker.trim() !== '') {
    const asNum = Number(speaker);
    return Number.isInteger(asNum) ? `Speaker ${asNum + 1}` : speaker;
  }
  return 'Speaker 1';
};

/**
 * Apply the overlay to the flat word list, producing the per-word DISPLAY value.
 * Muted words display their ORIGINAL text (struck through in the UI), so the
 * editor stays readable; the blank-on-export rule lives in projectRev only.
 */
const displayWords = (words, overlay) =>
  words.map((w) => {
    const o = overlay[w.key] || {};
    return {
      _key: w.key,
      start: typeof w.start === 'number' ? w.start : 0,
      end: typeof w.end === 'number' ? w.end : typeof w.start === 'number' ? w.start : 0,
      text: typeof o.value === 'string' ? o.value : w.value,
      confidence: w.confidence,
      muted: o.muted === true,
      speaker: w.speaker,
      punctAfter: w.punctAfter || '',
    };
  });

/**
 * Group the flat words into paragraphs: a new paragraph starts on speaker change,
 * or at a sentence end once the buffer reaches the target length (hard cap to
 * avoid runaway). Grouping is for DISPLAY only — it never affects export, which
 * walks the immutable original by anchor.
 * @param {{original:object, words:Array}} model
 * @param {object} history - snapshot history (overlay read at its cursor)
 * @param {object} [options]
 * @returns {Array} Slate value
 */
export const revModelToSlate = (model, history, options = {}) => {
  const overlay = currentOverlay(history);
  const wordsPerParagraph =
    typeof options.wordsPerParagraph === 'number' && options.wordsPerParagraph > 0 ? options.wordsPerParagraph : DEFAULT_WORDS_PER_PARAGRAPH;
  const hardLimit = Math.ceil(wordsPerParagraph * 1.5);
  const display = displayWords(model.words, overlay);

  const paragraphs = [];
  let buffer = [];
  let bufferSpeaker = null;

  const flush = () => {
    if (buffer.length === 0) return;
    const start = buffer[0].start;
    paragraphs.push({
      type: 'timedText',
      speaker: speakerLabel(bufferSpeaker),
      start,
      previousTimings: generatePreviousTimingsUpToCurrent(start),
      startTimecode: shortTimecode(start),
      children: [{ text: buffer.map((w) => w.text + (w.punctAfter || '')).join(' '), words: buffer.slice() }],
    });
    buffer = [];
  };

  display.forEach((w) => {
    if (buffer.length > 0 && w.speaker !== bufferSpeaker) flush();
    if (buffer.length === 0) bufferSpeaker = w.speaker;
    buffer.push(w);
    const endsSentence = SENTENCE_END.test(w.punctAfter || '');
    if ((endsSentence && buffer.length >= wordsPerParagraph) || buffer.length >= hardLimit) flush();
  });
  flush();

  return paragraphs;
};

/**
 * Project the rigid model to a DPE object ({ words, paragraphs }) that the
 * existing SlateTranscriptEditor accepts as `transcriptData`. The component runs
 * convertDpeToSlate internally, and getWordsForParagraph passes word objects
 * BY REFERENCE, so each word's `_key` / `confidence` / `muted` survives onto the
 * Slate leaf — which is what rigid edit-capture and follow-highlight read.
 *
 * Word count is fixed (mute/rewrite only), so paragraph ranges built from the
 * words stay contiguous and non-overlapping (the DPE contract).
 * @returns {{ words: Array, paragraphs: Array }}
 */
export const revModelToDpe = (model, history, options = {}) => {
  const slate = revModelToSlate(model, history, options);
  const words = [];
  const paragraphs = [];
  let wordId = 0;
  let paragraphId = 0;
  slate.forEach((para) => {
    const ws = para.children[0].words;
    if (ws.length === 0) return;
    ws.forEach((w) => {
      words.push({ ...w, id: wordId++ });
    });
    paragraphs.push({ id: paragraphId++, start: ws[0].start, end: ws[ws.length - 1].end, speaker: para.speaker });
  });
  return { words, paragraphs };
};

export default revModelToSlate;
