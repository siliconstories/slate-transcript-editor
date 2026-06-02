import {
  whisperxToModel,
  projectWhisperx,
  isWhisperxTranscript,
  WHISPERX_KEY,
  overlayFromSlate,
  setWordValue,
  setWordMuted,
  revertWord,
  newHistory,
  commit,
  undo,
  redo,
  currentOverlay,
  canUndo,
} from './whisperx-overlay.js';
import { whisperxModelToSlate } from './whisperx-to-slate.js';
import GEMS01 from './__fixtures__/whisperx-GEMS-01.json';
import GEMS26 from './__fixtures__/whisperx-GEMS-26.json';
import GEMS63 from './__fixtures__/whisperx-GEMS-63.json';

// --- hand-built sample with the adversarial traps ---
//  - punctuation glued INTO tokens ("werden,", "auch.")
//  - duplicate word value ("Ich" in both segments) for anchor routing
//  - two speakers, with rich annotations on segment 0
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
    detected_language: 'de',
    annotations: {
      topic_id_segment: 'career',
      chunk_topic_label: 'Career path',
      mood_segment: { primary: 'trust', primary_de: 'Vertrauen' },
      sentiment_segment: { label: 'neutral' },
      concept_tags_segment: { free: ['Vater', 'Oper'] },
    },
  }),
  seg(2.0, 2.4, 'SPEAKER_01', [w('Ich', 2.0, 2.2, 0.7, 'SPEAKER_01'), w('auch.', 2.2, 2.4, 0.6, 'SPEAKER_01')]),
];
const SAMPLE = {
  segments: SEGMENTS,
  word_segments: concat(SEGMENTS),
  annotation_metadata: { annotator: 'test', n_segments: 2, chunks: [] },
};

const FIXTURES = [
  ['GEMS-01 (single speaker)', GEMS01],
  ['GEMS-26 (multi-speaker)', GEMS26],
  ['GEMS-63 (empty-words segment)', GEMS63],
];

describe('isWhisperxTranscript', () => {
  it('requires BOTH segments and word_segments', () => {
    expect(isWhisperxTranscript(SAMPLE)).toBe(true);
    expect(isWhisperxTranscript({ segments: [] })).toBe(false); // word_segments missing
    expect(isWhisperxTranscript({ monologues: [] })).toBe(false); // rev.ai
    expect(isWhisperxTranscript({ words: [], paragraphs: [] })).toBe(false); // DPE
    expect(isWhisperxTranscript(null)).toBe(false);
  });
});

describe('whisperxToModel', () => {
  it('flattens segments[].words with "<segIdx>:<wordIdx>" anchors', () => {
    const { words } = whisperxToModel(SAMPLE);
    expect(words.map((x) => x.key)).toEqual(['0:0', '0:1', '0:2', '1:0', '1:1']);
    expect(words.map((x) => x.value)).toEqual(['Ich', 'wollte', 'werden,', 'Ich', 'auch.']);
  });

  it('keeps punctuation glued in the token value and maps score', () => {
    const { words } = whisperxToModel(SAMPLE);
    expect(words[2].value).toBe('werden,'); // punctuation in-token
    expect(words[2].score).toBe(0.95);
    expect(words[2].hasScore).toBe(true);
    expect(words[2].punctAfter).toBe(''); // never glued separately
  });

  it('carries per-word + per-segment speaker', () => {
    const { words } = whisperxToModel(SAMPLE);
    expect(words[0].speaker).toBe('SPEAKER_00');
    expect(words[3].speaker).toBe('SPEAKER_01');
    expect(words[3].segSpeaker).toBe('SPEAKER_01');
  });

  it('freezes the original', () => {
    const { original } = whisperxToModel(SAMPLE);
    expect(Object.isFrozen(original)).toBe(true);
    expect(() => {
      original.segments[0].words[0].word = 'X';
    }).toThrow();
  });

  it('throws on a non-whisperx input', () => {
    expect(() => whisperxToModel({ monologues: [] })).toThrow();
  });
});

describe('projectWhisperx (faithful export)', () => {
  it('empty overlay round-trips byte-identical to the original', () => {
    const { original } = whisperxToModel(SAMPLE);
    expect(projectWhisperx(original, {})).toEqual(SAMPLE);
  });

  it('rewrite sets word + score 1.0 and rebuilds segment.text + word_segments', () => {
    const { original } = whisperxToModel(SAMPLE);
    const out = projectWhisperx(original, { [WHISPERX_KEY(0, 1)]: { value: 'WOLLTE' } });
    expect(out.segments[0].words[1]).toEqual({ word: 'WOLLTE', start: 1.2, end: 1.4, score: 1.0, speaker: 'SPEAKER_00' });
    expect(out.segments[0].text).toBe('Ich WOLLTE werden,'); // text rebuilt
    expect(out.word_segments[1].word).toBe('WOLLTE'); // flat list regenerated
    expect(out.segments[1]).toEqual(SAMPLE.segments[1]); // other segment untouched
    expect(out.segments[0].annotations).toEqual(SAMPLE.segments[0].annotations); // annotations intact
  });

  it('mute removes the word from segment.words AND word_segments, rebuilding text', () => {
    const { original } = whisperxToModel(SAMPLE);
    const out = projectWhisperx(original, { [WHISPERX_KEY(0, 2)]: { muted: true } }); // mute "werden,"
    expect(out.segments[0].words.map((x) => x.word)).toEqual(['Ich', 'wollte']);
    expect(out.segments[0].text).toBe('Ich wollte');
    expect(out.word_segments.map((x) => x.word)).toEqual(['Ich', 'wollte', 'Ich', 'auch.']);
  });

  it('routes duplicate word values to the correct occurrence by anchor', () => {
    const { original } = whisperxToModel(SAMPLE);
    const out = projectWhisperx(original, { [WHISPERX_KEY(1, 0)]: { value: 'ICH2' } });
    expect(out.segments[0].words[0].word).toBe('Ich'); // first "Ich" untouched
    expect(out.segments[1].words[0].word).toBe('ICH2'); // second "Ich" edited
  });

  it('throws if an anchor does not resolve to a word', () => {
    const { original } = whisperxToModel(SAMPLE);
    expect(() => projectWhisperx(original, { '0:9': { value: 'x' } })).toThrow();
    expect(() => projectWhisperx(original, { '9:0': { value: 'x' } })).toThrow();
  });

  it('does NOT mutate the frozen original', () => {
    const { original } = whisperxToModel(SAMPLE);
    projectWhisperx(original, { [WHISPERX_KEY(0, 0)]: { value: 'X' } });
    expect(original.segments[0].words[0].word).toBe('Ich');
  });
});

describe('golden round-trip on real corpus fixtures', () => {
  it.each(FIXTURES)('%s: empty overlay export deep-equals the source file', (_label, file) => {
    const { original } = whisperxToModel(file);
    expect(projectWhisperx(original, {})).toEqual(file);
  });

  it('GEMS-01: an edit changes only the edited words, preserving everything else', () => {
    const { original, words } = whisperxToModel(GEMS01);
    const firstKey = words[0].key;
    const muteKey = words[3].key;
    const out = projectWhisperx(original, { [firstKey]: { value: 'EDITED' }, [muteKey]: { muted: true } });

    // edited word reflects value + score 1.0
    expect(out.segments[0].words[0].word).toBe('EDITED');
    expect(out.segments[0].words[0].score).toBe(1.0);
    // muted word is gone from both lists
    const muteWordText = GEMS01.segments[0].words[3].word;
    expect(out.segments[0].words.length).toBe(GEMS01.segments[0].words.length - 1);
    // annotations + metadata + later segments are byte-identical
    expect(out.annotation_metadata).toEqual(GEMS01.annotation_metadata);
    expect(out.segments[0].annotations).toEqual(GEMS01.segments[0].annotations);
    expect(out.segments.slice(1)).toEqual(GEMS01.segments.slice(1));
    // word_segments stays the exact concat of segments[].words
    expect(out.word_segments).toEqual(out.segments.flatMap((s) => s.words || []));
    expect(typeof muteWordText).toBe('string');
  });
});

describe('overlayFromSlate (count invariant)', () => {
  it('diffs the slate value into an overlay keyed by _key', () => {
    const model = whisperxToModel(SAMPLE);
    const value = whisperxModelToSlate(model, newHistory());
    value[0].children[0].words[1].text = 'WOLLTE'; // rewrite "wollte"
    value[1].children[0].words[0].muted = true; // mute "Ich" in seg 1
    expect(overlayFromSlate(model, value)).toEqual({ '0:1': { value: 'WOLLTE' }, '1:0': { muted: true } });
  });

  it('rejects (null) a value that drops a word (structural edit leaked)', () => {
    const model = whisperxToModel(SAMPLE);
    const value = whisperxModelToSlate(model, newHistory());
    value[0].children[0].words.pop();
    expect(overlayFromSlate(model, value)).toBeNull();
  });

  it('rejects (null) an unknown/duplicate anchor', () => {
    const model = whisperxToModel(SAMPLE);
    const value = whisperxModelToSlate(model, newHistory());
    value[0].children[0].words[0]._key = '9:9';
    expect(overlayFromSlate(model, value)).toBeNull();
  });
});

describe('shared overlay edit helpers + history (re-exported)', () => {
  it('setWordValue / setWordMuted / revertWord behave', () => {
    let o = setWordValue({}, '0:1', 'dog', 'cat');
    expect(o['0:1']).toEqual({ value: 'dog' });
    o = setWordMuted(o, '0:1', true);
    expect(o['0:1']).toEqual({ value: 'dog', muted: true });
    o = revertWord(o, '0:1');
    expect(o['0:1']).toBeUndefined();
  });

  it('commit/undo/redo navigate overlay states', () => {
    let h = newHistory();
    expect(canUndo(h)).toBe(false);
    h = commit(h, { '0:1': { value: 'dog' } });
    expect(currentOverlay(h)['0:1']).toEqual({ value: 'dog' });
    h = undo(h);
    expect(currentOverlay(h)).toEqual({});
    h = redo(h);
    expect(currentOverlay(h)['0:1']).toEqual({ value: 'dog' });
  });
});
