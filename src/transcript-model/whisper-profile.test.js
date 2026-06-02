import { createWhisperProfile, whisperDescriptor } from './whisper-profile';

// ---- rev.ai fixture ----
const txt = (value, ts, end_ts, confidence) => {
  const e = { type: 'text', value, ts, end_ts };
  if (typeof confidence === 'number') e.confidence = confidence;
  return e;
};
const sp = { type: 'punct', value: ' ' };
const pn = (v) => ({ type: 'punct', value: v });
const REV = {
  monologues: [
    { speaker: 0, elements: [txt('the', 0, 0.2, 0.9), sp, txt('cat', 0.2, 0.4, 0.8), sp, txt('sat', 0.4, 0.6, 0.99), pn('.')] },
    { speaker: 1, elements: [txt('and', 1.0, 1.2, 0.7), sp, txt('ran', 1.2, 1.4, 0.95), pn('.')] },
  ],
};

// ---- WhisperX fixture ----
const w = (word, start, end, score, speaker = 'SPEAKER_00') => ({ word, start, end, score, speaker });
const seg = (start, end, speaker, words, extra = {}) => ({ start, end, text: words.map((x) => x.word).join(' '), speaker, words, ...extra });
const concat = (segments) => segments.flatMap((s) => s.words);
const SEGMENTS = [
  seg(1.0, 1.6, 'SPEAKER_00', [w('Ich', 1.0, 1.2, 0.9), w('wollte', 1.2, 1.4, 0.8), w('werden,', 1.4, 1.6, 0.95)], {
    annotations: { chunk_topic_label: 'Career path', sentiment_segment: { label: 'neutral' } },
  }),
  seg(2.0, 2.4, 'SPEAKER_01', [w('Ich', 2.0, 2.2, 0.7, 'SPEAKER_01'), w('auch.', 2.2, 2.4, 0.6, 'SPEAKER_01')]),
];
const WHISPERX = { segments: SEGMENTS, word_segments: concat(SEGMENTS), annotation_metadata: { chunks: [] } };

const DPE = { words: [{ start: 0, end: 0.2, text: 'hi' }], paragraphs: [{ start: 0, end: 0.2, speaker: 'A' }] };
const clone = (o) => JSON.parse(JSON.stringify(o));

describe('whisper profile — single tier, two source formats', () => {
  it('descriptor detects rev.ai and WhisperX but not DPE/junk', () => {
    expect(whisperDescriptor.id).toBe('whisper');
    expect(whisperDescriptor.detect(REV)).toBe(true);
    expect(whisperDescriptor.detect(WHISPERX)).toBe(true);
    expect(whisperDescriptor.detect(DPE)).toBe(false);
    expect(whisperDescriptor.detect({})).toBe(false);
  });

  it('rejects an unrecognized transcript on import', () => {
    expect(() => createWhisperProfile().import(DPE)).toThrow(/rev\.ai.*WhisperX|WhisperX.*rev\.ai/);
  });

  it('shares one editPolicy (word + freestyle) regardless of format', () => {
    const base = { allowsStructuralEdits: false, allowsFreeText: false, wordLevelOnly: true, modes: ['word', 'freestyle'], defaultMode: 'word' };
    const r = createWhisperProfile();
    r.import(REV);
    expect(r.editPolicy).toMatchObject({ ...base, supportsAnnotations: false });
    const x = createWhisperProfile();
    x.import(WHISPERX);
    expect(x.editPolicy).toMatchObject({ ...base, supportsAnnotations: true });
  });

  describe('rev.ai format', () => {
    it('imports to one model+value; leaf text is the bare word join (offset convention)', () => {
      const p = createWhisperProfile();
      const { value, model } = p.import(REV);
      expect(model.format).toBe('revai');
      expect(Object.isFrozen(model.original)).toBe(true);
      const words = value[0].children[0].words;
      expect(words[0]._key).toBe('0:0');
      expect(words[0].confidence).toBe(0.9);
      expect(words[2].punctAfter).toBe('.'); // display-only punctuation on the word
      expect(value[0].children[0].text).toBe('the cat sat'); // NOT glued — no DPE round-trip
      expect(p.format).toBe('revai');
      expect(p.confidenceDefaults).toBeUndefined();
      expect(p.exporters.map((e) => e.id)).toEqual(['json-rev', 'json-rev-sentences', 'ste-session']);
    });

    it('zero-overlay export round-trips byte-identical to the original (lossless covenant)', () => {
      const p = createWhisperProfile();
      p.import(REV);
      expect(p.exporters[0].run()).toEqual(REV);
    });

    it('snapshot(rewrite) commits and faithful export reflects it; untouched elements intact', () => {
      const p = createWhisperProfile();
      const { value } = p.import(REV);
      const edited = clone(value);
      edited[0].children[0].words[0].text = 'THE';
      expect(p.versioning.snapshot(edited)).toBe(true);
      const out = p.exporters[0].run();
      expect(out.monologues[0].elements[0]).toEqual({ type: 'text', value: 'THE', ts: 0, end_ts: 0.2, confidence: 1.0 });
      expect(out.monologues[0].elements[5]).toEqual({ type: 'punct', value: '.' });
    });

    it('rejects a count-invariant violation', () => {
      const p = createWhisperProfile();
      const { value } = p.import(REV);
      const broken = clone(value);
      broken[0].children[0].words.pop();
      expect(p.versioning.snapshot(broken)).toBe(false);
      expect(p.exporters[0].run()).toEqual(REV);
    });
  });

  describe('whisperx format', () => {
    it('imports one paragraph per segment with annotations + confidence defaults', () => {
      const p = createWhisperProfile();
      const { value, model } = p.import(WHISPERX);
      expect(model.format).toBe('whisperx');
      expect(value.length).toBe(2);
      expect(value[0].children[0].words[0]._key).toBe('0:0');
      expect(value[0].annotations.topicLabel).toBe('Career path');
      expect(p.confidenceDefaults).toMatchObject({ cutoff: 0.3, floor: 0.08, cutoffOptions: [0.2, 0.3, 0.45, 0.5, 0.55] });
      // sentence overlay gets its own, higher cutoff (sentence means run higher than word scores)
      expect(p.confidenceDefaults.sentenceCutoff).toBe(0.5);
      expect(p.exporters.map((e) => e.id)).toEqual(['json-whisperx', 'ste-session']);
    });

    it('zero-overlay export round-trips byte-identical to the original (lossless covenant)', () => {
      const p = createWhisperProfile();
      p.import(WHISPERX);
      expect(p.exporters[0].run()).toEqual(WHISPERX);
    });

    it('snapshot(rewrite) rebuilds segment text + word_segments; annotations preserved', () => {
      const p = createWhisperProfile();
      const { value } = p.import(WHISPERX);
      const edited = clone(value);
      edited[0].children[0].words[1].text = 'WOLLTE';
      expect(p.versioning.snapshot(edited)).toBe(true);
      const out = p.exporters[0].run();
      expect(out.segments[0].words[1]).toEqual({ word: 'WOLLTE', start: 1.2, end: 1.4, score: 1.0, speaker: 'SPEAKER_00' });
      expect(out.segments[0].text).toBe('Ich WOLLTE werden,');
      expect(out.segments[0].annotations).toEqual(WHISPERX.segments[0].annotations);
      expect(out.segments[1]).toEqual(WHISPERX.segments[1]);
    });

    it('undo/redo navigate snapshots and reproject re-derives the value', () => {
      const p = createWhisperProfile();
      const { value } = p.import(WHISPERX);
      const edited = clone(value);
      edited[0].children[0].words[0].text = 'ICH';
      p.versioning.snapshot(edited);
      expect(p.reproject()[0].children[0].words[0].text).toBe('ICH');
      p.versioning.undo();
      expect(p.reproject()[0].children[0].words[0].text).toBe('Ich');
      expect(p.exporters[0].run()).toEqual(WHISPERX);
    });
  });
});
