import { createWhisperProfile } from './whisper-profile.js';
import { alignParagraph } from './align-paragraph.js';
import { tokenToLeafWord } from './freetext-to-slate.js';

// Simulate a Freestyle commit on paragraph 0: align the edited text against the
// paragraph's original words, write the aligned tokens onto the leaf, return the value.
const freestyleEdit = (profile, value, editedText) => {
  const para = value[0];
  const aligned = alignParagraph(profile.originalWordsBetween(para.anchorKey, para.span.lastWordKey), editedText);
  const words = aligned.map((t) => tokenToLeafWord(t, para.speaker));
  return [{ ...para, children: [{ ...para.children[0], text: words.map((w) => w.text).join(' '), words }] }, ...value.slice(1)];
};

describe('whisper profile (rev.ai) — Freestyle round-trip', () => {
  const REV = {
    monologues: [
      {
        speaker: 0,
        elements: [
          { type: 'text', value: 'the', ts: 0.0, end_ts: 0.2, confidence: 0.9 },
          { type: 'punct', value: ' ' },
          { type: 'text', value: 'cat', ts: 1.0, end_ts: 1.2, confidence: 0.8 },
          { type: 'punct', value: ' ' },
          { type: 'text', value: 'sat', ts: 1.2, end_ts: 1.6, confidence: 0.99 },
          { type: 'punct', value: '.' },
        ],
      },
    ],
  };

  it('stamps each paragraph with anchorKey + span on import', () => {
    const p = createWhisperProfile();
    const { value } = p.import(REV);
    expect(value[0].anchorKey).toBe('0:0');
    expect(value[0].span).toEqual({ firstWordKey: '0:0', lastWordKey: '0:4', monoIdx: 0, elemStart: 0, elemEnd: 5 });
  });

  it('an inserted word commits via snapshotFreeText and the faithful export reflects it (conf 1.0); survivors keep timing', () => {
    const p = createWhisperProfile();
    const { value } = p.import(REV);
    const edited = freestyleEdit(p, value, 'the big cat sat.');
    expect(p.versioning.snapshotFreeText(edited)).toBe(true);

    const out = p.exporters.find((e) => e.id === 'json-rev').run();
    expect(out.monologues[0].elements.map((e) => e.value)).toEqual(['the', ' ', 'big', ' ', 'cat', ' ', 'sat', '.']);
    expect(out.monologues[0].elements[2].confidence).toBe(1.0); // inserted "big"
    expect(out.monologues[0].elements[4]).toEqual({ type: 'text', value: 'cat', ts: 1.0, end_ts: 1.2, confidence: 0.8 }); // survivor verbatim
  });

  it('reproject renders the inserted word as estimated; revertAll restores the original', () => {
    const p = createWhisperProfile();
    const { value } = p.import(REV);
    p.versioning.snapshotFreeText(freestyleEdit(p, value, 'the big cat sat.'));

    const reprojected = p.reproject();
    const words = reprojected[0].children[0].words;
    expect(words.map((w) => w.text)).toEqual(['the', 'big', 'cat', 'sat.']);
    expect(words[1]._key).toBeNull();
    expect(words[1].timingSource).toBe('interpolated');
    expect(words[0].timingSource).toBe('original');

    p.versioning.revertAll();
    const restored = p.reproject();
    expect(restored[0].children[0].words.map((w) => w.text)).toEqual(['the', 'cat', 'sat']);
  });
});

describe('whisper profile (whisperx) — Freestyle round-trip', () => {
  const w = (word, start, end, score, speaker) => ({ word, start, end, score, speaker });
  const segs = [
    {
      start: 0,
      end: 1.6,
      text: 'the cat sat',
      speaker: 'S0',
      words: [w('the', 0, 0.2, 0.9, 'S0'), w('cat', 1.0, 1.2, 0.8, 'S0'), w('sat', 1.2, 1.6, 0.99, 'S0')],
    },
  ];
  const WX = { segments: segs, word_segments: [...segs[0].words] };

  it('an inserted word commits and the faithful export rebuilds the segment (score 1.0); survivors keep timing+speaker', () => {
    const p = createWhisperProfile();
    const { value } = p.import(WX);
    expect(value[0].span.segIdx).toBe(0);

    const edited = freestyleEdit(p, value, 'the big cat sat');
    expect(p.versioning.snapshotFreeText(edited)).toBe(true);

    const out = p.exporters.find((e) => e.id === 'json-whisperx').run();
    expect(out.segments[0].words.map((x) => x.word)).toEqual(['the', 'big', 'cat', 'sat']);
    expect(out.segments[0].text).toBe('the big cat sat');
    expect(out.segments[0].words[1]).toEqual({ word: 'big', start: 0.2, end: 1.0, score: 1.0 });
    expect(out.segments[0].words[2]).toEqual(w('cat', 1.0, 1.2, 0.8, 'S0')); // survivor verbatim
    expect(out.word_segments.length).toBe(4);
  });
});
