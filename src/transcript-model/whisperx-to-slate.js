/**
 * Build the editor's Slate value for the WHISPERX tier — ONE PARAGRAPH PER SEGMENT.
 *
 * Unlike the rev.ai path (which constructs paragraphs with a words-per-sentence
 * heuristic), WhisperX already ships segmented sentences, so we map each segment
 * straight to a paragraph: `segment.text`/`segment.speaker` drive the block, and
 * the segment's words become the editable leaf words. `score` maps to `confidence`
 * so the existing confidence overlay works unchanged; punctuation lives inside each
 * token so `punctAfter` is always ''.
 *
 * This projects DIRECTLY from the model to Slate (not model -> DPE -> slate like
 * rigid): a wordless segment (text but empty `words[]`) must survive as a read-only
 * paragraph, and the DPE round-trip's `getWordsForParagraph` cannot represent a
 * paragraph with no word-timings to anchor on.
 *
 * Slate paragraph shape (matches src/util/dpe-to-slate output, plus `annotations`):
 *   { type:'timedText', speaker, start, previousTimings, startTimecode, annotations,
 *     children:[{ text:'<words joined by space>', words:[ word objs ] }] }
 *
 * The `words` carried on the leaf are NEW objects each projection (so a remount
 * re-stamps `_key`; we never rely on by-reference survival across remounts).
 */
import { shortTimecode } from '../util/timecode-converter';
import generatePreviousTimingsUpToCurrent from '../util/dpe-to-slate/generate-previous-timings-up-to-current';
import { currentOverlay } from './overlay-history';

const DEFAULT_SPEAKER = 'SPEAKER_00';

/**
 * Display-only projection of a segment's rich annotations, for the read-only chips
 * rendered under each paragraph. Returns null when there is nothing worth showing.
 */
const slimAnnotations = (annotations) => {
  if (!annotations || typeof annotations !== 'object') return null;
  const mood = annotations.mood_segment || {};
  const sentiment = annotations.sentiment_segment || {};
  const concept = annotations.concept_tags_segment || {};
  const out = {
    topicLabel: annotations.chunk_topic_label || null,
    topicId: annotations.topic_id_segment || null,
    mood: mood.primary_de || mood.primary || null,
    sentiment: sentiment.label || null,
    conceptTags: Array.isArray(concept.free) ? concept.free.slice(0, 6) : [],
  };
  if (!out.topicLabel && !out.topicId && !out.mood && !out.sentiment && out.conceptTags.length === 0) return null;
  return out;
};

/**
 * Project the immutable model (at the current history cursor) to a Slate value.
 * @param {{original:object, words:Array}} model
 * @param {object} history - snapshot history (overlay read at its cursor)
 * @returns {Array} Slate value
 */
export const whisperxModelToSlate = (model, history) => {
  const overlay = currentOverlay(history);

  // Group the flat model words by segment index for O(1) lookup per segment.
  const bySeg = new Map();
  model.words.forEach((w) => {
    if (!bySeg.has(w.segIdx)) bySeg.set(w.segIdx, []);
    bySeg.get(w.segIdx).push(w);
  });

  return model.original.segments.map((seg, segIdx) => {
    const modelWords = bySeg.get(segIdx) || [];
    const words = modelWords.map((w) => {
      const o = overlay[w.key] || {};
      return {
        _key: w.key,
        start: typeof w.start === 'number' ? w.start : 0,
        end: typeof w.end === 'number' ? w.end : typeof w.start === 'number' ? w.start : 0,
        text: typeof o.value === 'string' ? o.value : w.value,
        confidence: w.score,
        muted: o.muted === true,
        speaker: w.speaker,
        punctAfter: '',
      };
    });

    const start = typeof seg.start === 'number' ? seg.start : words.length > 0 ? words[0].start : 0;
    // Empty-words segment: keep the segment text as a read-only block (no anchors,
    // so word-level editing has nothing to mutate and structural edits are gated off).
    const text = words.length > 0 ? words.map((w) => w.text).join(' ') : typeof seg.text === 'string' ? seg.text : '';

    return {
      type: 'timedText',
      // Keep the diarization label verbatim (SPEAKER_00…). Users can still rename
      // via the speaker click prompt; renames are display-only (faithful export
      // keeps the original segment/word speaker), same as the rigid tier.
      speaker: typeof seg.speaker === 'string' && seg.speaker ? seg.speaker : DEFAULT_SPEAKER,
      start,
      previousTimings: generatePreviousTimingsUpToCurrent(start),
      startTimecode: shortTimecode(start),
      annotations: slimAnnotations(seg.annotations),
      children: [{ text, words }],
    };
  });
};

export default whisperxModelToSlate;
