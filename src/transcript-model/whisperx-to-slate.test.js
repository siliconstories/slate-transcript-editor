import { whisperxModelToSlate } from './whisperx-to-slate.js';
import { whisperxToModel, newHistory, commit, setWordValue, setWordMuted } from './whisperx-overlay.js';
import GEMS26 from './__fixtures__/whisperx-GEMS-26.json';
import GEMS63 from './__fixtures__/whisperx-GEMS-63.json';

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
    annotations: {
      chunk_topic_label: 'Career path',
      mood_segment: { primary: 'trust', primary_de: 'Vertrauen' },
      sentiment_segment: { label: 'neutral' },
      concept_tags_segment: { free: ['Vater', 'Oper'] },
    },
  }),
  seg(2.0, 2.4, 'SPEAKER_01', [w('Ich', 2.0, 2.2, 0.7, 'SPEAKER_01'), w('auch.', 2.2, 2.4, 0.6, 'SPEAKER_01')]),
];
const SAMPLE = { segments: SEGMENTS, word_segments: concat(SEGMENTS), annotation_metadata: { chunks: [] } };

describe('whisperxModelToSlate', () => {
  it('makes one paragraph per segment with the verbatim diarization speaker', () => {
    const value = whisperxModelToSlate(whisperxToModel(SAMPLE), newHistory());
    expect(value.length).toBe(2);
    expect(value[0].speaker).toBe('SPEAKER_00');
    expect(value[1].speaker).toBe('SPEAKER_01');
    expect(value[0].type).toBe('timedText');
    expect(value[0].start).toBe(1.0);
  });

  it('leaf text reproduces segment.text; score maps to confidence; punctAfter empty; unique _keys', () => {
    const value = whisperxModelToSlate(whisperxToModel(SAMPLE), newHistory());
    const words = value[0].children[0].words;
    expect(value[0].children[0].text).toBe('Ich wollte werden,');
    expect(words[2].text).toBe('werden,');
    expect(words[0].confidence).toBe(0.9);
    expect(words[2].punctAfter).toBe('');
    expect(words.map((x) => x._key)).toEqual(['0:0', '0:1', '0:2']);
  });

  it('projects slim, display-only annotations onto the paragraph (null when absent)', () => {
    const value = whisperxModelToSlate(whisperxToModel(SAMPLE), newHistory());
    expect(value[0].annotations).toEqual({
      topicLabel: 'Career path',
      topicId: null,
      mood: 'Vertrauen',
      sentiment: 'neutral',
      conceptTags: ['Vater', 'Oper'],
    });
    expect(value[1].annotations).toBeNull(); // segment without annotations
  });

  it('reflects an overlay rewrite in the display text without changing word count', () => {
    const model = whisperxToModel(SAMPLE);
    const h = commit(newHistory(), setWordValue({}, '0:1', 'WOLLTE', 'wollte'));
    const value = whisperxModelToSlate(model, h);
    expect(value[0].children[0].words.length).toBe(3);
    expect(value[0].children[0].text).toBe('Ich WOLLTE werden,');
  });

  it('a muted word still shows its ORIGINAL text with muted:true (blanking is export-only)', () => {
    const model = whisperxToModel(SAMPLE);
    const h = commit(newHistory(), setWordMuted({}, '0:2', true));
    const value = whisperxModelToSlate(model, h);
    const word = value[0].children[0].words[2];
    expect(word.text).toBe('werden,');
    expect(word.muted).toBe(true);
  });

  it('renders an empty-words segment as a read-only paragraph (GEMS-63)', () => {
    const value = whisperxModelToSlate(whisperxToModel(GEMS63), newHistory());
    expect(value.length).toBe(GEMS63.segments.length);
    const emptyIdx = GEMS63.segments.findIndex((s) => !Array.isArray(s.words) || s.words.length === 0);
    expect(emptyIdx).toBeGreaterThanOrEqual(0);
    expect(value[emptyIdx].children[0].words).toEqual([]);
    expect(value[emptyIdx].children[0].text).toBe(GEMS63.segments[emptyIdx].text);
  });

  it('multi-speaker file: paragraph uses segment speaker, leaves preserve per-word speaker (GEMS-26)', () => {
    const value = whisperxModelToSlate(whisperxToModel(GEMS26), newHistory());
    value.forEach((para, i) => {
      expect(para.speaker).toBe(GEMS26.segments[i].speaker);
    });
    // at least one segment has words whose speaker differs from the segment speaker
    const mixed = GEMS26.segments.some((s) => (s.words || []).some((x) => x.speaker !== s.speaker));
    expect(mixed).toBe(true);
    value.forEach((para, i) => {
      para.children[0].words.forEach((leaf, j) => {
        expect(leaf.speaker).toBe(GEMS26.segments[i].words[j].speaker);
      });
    });
  });
});
