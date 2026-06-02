import { createWhisperxProfile, whisperxDescriptor } from './whisperx-profile';

const w = (word, start, end, score, speaker = 'SPEAKER_00') => ({ word, start, end, score, speaker });
const seg = (start, end, speaker, words, extra = {}) => ({
  start,
  end,
  text: words.map((x) => x.word).join(' '),
  speaker,
  words,
  ...extra,
});
const concat = (segments) => segments.flatMap((s) => s.words);

const SEGMENTS = [
  seg(1.0, 1.6, 'SPEAKER_00', [w('Ich', 1.0, 1.2, 0.9), w('wollte', 1.2, 1.4, 0.8), w('werden,', 1.4, 1.6, 0.95)], {
    annotations: { chunk_topic_label: 'Career path', sentiment_segment: { label: 'neutral' } },
  }),
  seg(2.0, 2.4, 'SPEAKER_01', [w('Ich', 2.0, 2.2, 0.7, 'SPEAKER_01'), w('auch.', 2.2, 2.4, 0.6, 'SPEAKER_01')]),
];
const SAMPLE = { segments: SEGMENTS, word_segments: concat(SEGMENTS), annotation_metadata: { chunks: [] } };
const REV = { monologues: [{ speaker: 0, elements: [{ type: 'text', value: 'hi', ts: 0, end_ts: 0.2 }] }] };
const DPE = { words: [{ start: 0, end: 0.2, text: 'hi' }], paragraphs: [{ start: 0, end: 0.2, speaker: 'A' }] };

const clone = (o) => JSON.parse(JSON.stringify(o));

describe('whisperx profile', () => {
  it('descriptor detects WhisperX but not rev.ai or DPE', () => {
    expect(whisperxDescriptor.id).toBe('whisperx');
    expect(whisperxDescriptor.detect(SAMPLE)).toBe(true);
    expect(whisperxDescriptor.detect(REV)).toBe(false);
    expect(whisperxDescriptor.detect(DPE)).toBe(false);
  });

  it('import() yields one paragraph per segment whose leaf words carry _key + confidence', () => {
    const p = createWhisperxProfile();
    const { value, model } = p.import(SAMPLE);
    expect(Object.isFrozen(model.original)).toBe(true);
    expect(value.length).toBe(2);
    const words = value[0].children[0].words;
    expect(words[0]._key).toBe('0:0');
    expect(words[0].confidence).toBe(0.9);
    expect(words[2].text).toBe('werden,'); // punctuation in-token
    expect(value[0].annotations.topicLabel).toBe('Career path');
  });

  it('is word-level-only with no structural edits, with word + freestyle modes', () => {
    expect(createWhisperxProfile().editPolicy).toEqual({
      allowsStructuralEdits: false,
      allowsFreeText: false,
      wordLevelOnly: true,
      modes: ['word', 'freestyle'],
      defaultMode: 'word',
    });
  });

  it('declares lowered confidence defaults for the alignment-score scale', () => {
    expect(createWhisperxProfile().confidenceDefaults).toEqual({ cutoff: 0.3, floor: 0.08, cutoffOptions: [0.2, 0.3, 0.45, 0.5, 0.55] });
  });

  it('faithful export with no edits round-trips byte-identical to the original', () => {
    const p = createWhisperxProfile();
    p.import(SAMPLE);
    expect(p.exporters[0].id).toBe('json-whisperx');
    expect(p.exporters[0].run()).toEqual(SAMPLE);
  });

  it('snapshot(rewrite) commits and the faithful export reflects it (word + score 1.0, text rebuilt)', () => {
    const p = createWhisperxProfile();
    const { value } = p.import(SAMPLE);
    const edited = clone(value);
    edited[0].children[0].words[1].text = 'WOLLTE'; // rewrite "wollte" (0:1)
    expect(p.versioning.snapshot(edited)).toBe(true);
    const out = p.exporters[0].run();
    expect(out.segments[0].words[1]).toEqual({ word: 'WOLLTE', start: 1.2, end: 1.4, score: 1.0, speaker: 'SPEAKER_00' });
    expect(out.segments[0].text).toBe('Ich WOLLTE werden,');
    expect(out.segments[0].annotations).toEqual(SAMPLE.segments[0].annotations); // annotations preserved
    expect(out.segments[1]).toEqual(SAMPLE.segments[1]); // untouched segment intact
  });

  it('snapshot rejects a value that violates the word-count invariant', () => {
    const p = createWhisperxProfile();
    const { value } = p.import(SAMPLE);
    const broken = clone(value);
    broken[0].children[0].words.pop(); // drop a word -> count mismatch
    expect(p.versioning.snapshot(broken)).toBe(false);
    expect(p.exporters[0].run()).toEqual(SAMPLE); // history did not advance
  });

  it('revertAll clears edits so the export equals the original again', () => {
    const p = createWhisperxProfile();
    const { value } = p.import(SAMPLE);
    const edited = clone(value);
    edited[1].children[0].words[1].text = 'AUCH';
    p.versioning.snapshot(edited);
    expect(p.exporters[0].run()).not.toEqual(SAMPLE);
    p.versioning.revertAll();
    expect(p.exporters[0].run()).toEqual(SAMPLE);
  });

  it('undo/redo navigate snapshots and reproject re-derives the value', () => {
    const p = createWhisperxProfile();
    const { value } = p.import(SAMPLE);
    const edited = clone(value);
    edited[0].children[0].words[0].text = 'ICH'; // rewrite "Ich"
    p.versioning.snapshot(edited);
    expect(p.versioning.canUndo()).toBe(true);
    expect(p.reproject()[0].children[0].words[0].text).toBe('ICH');
    p.versioning.undo();
    expect(p.reproject()[0].children[0].words[0].text).toBe('Ich');
    expect(p.exporters[0].run()).toEqual(SAMPLE);
  });
});
