import buildSentenceModel, { isRevTranscript, confidenceOf, round, groupSlateWordsIntoSentences } from './index';
import splitSentences from './split-sentences';
import revInput from './__fixtures__/GEMS-01.json';
import goldSentences from './__fixtures__/GEMS-01.sentences.json';

describe('buildSentenceModel — golden (GEMS-01)', () => {
  const model = buildSentenceModel(revInput);

  it('reproduces the reference sentence file exactly', () => {
    expect(model).toEqual(goldSentences);
  });

  it('emits the documented header', () => {
    expect(model.confidence_format).toEqual(['mean', 'duration_weighted']);
    expect(model.speakers).toEqual([0]);
    expect(model.sentence_count).toBe(27);
    expect(model.word_count).toBe(259);
    expect(model.duration_sec).toBe(100.48);
    expect(model.confidence).toEqual([0.798, 0.821]);
  });

  it('splits into 15 + 12 sentences across the two monologues', () => {
    expect(model.monologues.map((m) => m.sentences.length)).toEqual([15, 12]);
  });

  it('computes sentence-1 dual confidence', () => {
    expect(model.monologues[0].sentences[0].confidence).toEqual([0.934, 0.922]);
  });

  it('rounds a 0.7775 mean down to 0.777 (Number(toFixed) not Math.round)', () => {
    const cueHaute = model.monologues.flatMap((m) => m.sentences).find((s) => s.text === 'Im Film «Cue Haute».');
    expect(cueHaute.confidence[0]).toBe(0.777);
    // the integer-scaled path the spec warns against would give 0.778
    expect(Math.round(0.7775 * 1000) / 1000).toBe(0.778);
  });
});

describe('buildSentenceModel — splitting rules', () => {
  it('does not split on an in-word ellipsis token', () => {
    const rev = {
      monologues: [
        {
          speaker: 0,
          elements: [
            { type: 'text', value: 'weil', ts: 0, end_ts: 1, confidence: 0.9 },
            { type: 'punct', value: ' ' },
            { type: 'text', value: 'ich...', ts: 1, end_ts: 2, confidence: 0.8 },
            { type: 'punct', value: ' ' },
            { type: 'text', value: 'Also', ts: 2, end_ts: 3, confidence: 0.7 },
            { type: 'punct', value: '.' },
          ],
        },
      ],
    };
    const model = buildSentenceModel(rev);
    expect(model.sentence_count).toBe(1);
    expect(model.monologues[0].sentences[0].text).toBe('weil ich... Also.');
    expect(model.monologues[0].sentences[0].word_count).toBe(3);
  });

  it('never crosses a monologue boundary', () => {
    const rev = {
      monologues: [
        { speaker: 0, elements: [{ type: 'text', value: 'A', ts: 0, end_ts: 1, confidence: 0.9 }] },
        { speaker: 1, elements: [{ type: 'text', value: 'B', ts: 1, end_ts: 2, confidence: 0.9 }] },
      ],
    };
    const model = buildSentenceModel(rev);
    expect(model.monologues).toHaveLength(2);
    expect(model.sentence_count).toBe(2);
    expect(model.speakers).toEqual([0, 1]);
  });
});

describe('buildSentenceModel — confidence edge cases', () => {
  it('emits [null, null] when no word carries a numeric confidence', () => {
    const rev = {
      monologues: [
        {
          speaker: 0,
          elements: [
            { type: 'text', value: 'Hallo', ts: 0, end_ts: 1 },
            { type: 'punct', value: '.' },
          ],
        },
      ],
    };
    const model = buildSentenceModel(rev);
    expect(model.monologues[0].sentences[0].confidence).toEqual([null, null]);
    expect(model.confidence).toEqual([null, null]);
  });

  it('falls back to mean when total duration is zero', () => {
    const rev = {
      monologues: [
        {
          speaker: 0,
          elements: [
            { type: 'text', value: 'Hi', ts: 5, end_ts: 5, confidence: 0.5 },
            { type: 'punct', value: '.' },
          ],
        },
      ],
    };
    const [mean, weighted] = buildSentenceModel(rev).monologues[0].sentences[0].confidence;
    expect(mean).toBe(0.5);
    expect(weighted).toBe(0.5);
  });
});

describe('buildSentenceModel — opt-in segmenter', () => {
  it('keeps the default at 27 sentences while sbd over-segments', () => {
    const def = buildSentenceModel(revInput);
    const viaSbd = buildSentenceModel(revInput, { splitter: (t) => splitSentences(t) });
    expect(def.sentence_count).toBe(27);
    expect(viaSbd.sentence_count).toBeGreaterThan(27);
    expect(viaSbd.word_count).toBe(259);
  });

  it('accepts an arbitrary custom splitter without dropping words', () => {
    const model = buildSentenceModel(revInput, { splitter: (t) => t.split('\n') });
    expect(model.sentence_count).toBe(2);
    expect(model.word_count).toBe(259);
  });
});

describe('reusable exports for the overlay (confidenceOf, round, groupSlateWordsIntoSentences)', () => {
  it('round uses Number(toFixed) semantics', () => {
    expect(round(0.7775, 3)).toBe(0.777);
    expect(round(100.48, 2)).toBe(100.48);
  });

  it('confidenceOf works on the Slate word shape', () => {
    const words = [
      { text: 'a', start: 0, end: 1, confidence: 0.9 },
      { text: 'b', start: 1, end: 2, confidence: 0.7 },
    ];
    expect(confidenceOf(words)).toEqual([0.8, expect.any(Number)]);
    expect(confidenceOf([{ text: 'x', start: 0, end: 1 }])).toEqual([null, null]);
  });

  it('groupSlateWordsIntoSentences splits on terminal punct in text or punctAfter', () => {
    const words = [
      { text: 'Hi', punctAfter: '' },
      { text: 'there', punctAfter: '.' },
      { text: 'Next', punctAfter: '' },
      { text: 'one.', punctAfter: '' },
      { text: 'tail', punctAfter: '' },
    ];
    const groups = groupSlateWordsIntoSentences(words);
    expect(groups.map((g) => [g.wIdxStart, g.wIdxEnd])).toEqual([
      [0, 1],
      [2, 3],
      [4, 4],
    ]);
  });
});

describe('isRevTranscript', () => {
  it('detects rev.ai shape', () => {
    expect(isRevTranscript({ monologues: [] })).toBe(true);
    expect(isRevTranscript({ words: [] })).toBe(false);
    expect(isRevTranscript(null)).toBe(false);
  });

  it('returns null from buildSentenceModel for non-rev input', () => {
    expect(buildSentenceModel({ words: [] })).toBeNull();
    expect(buildSentenceModel(null)).toBeNull();
  });
});
