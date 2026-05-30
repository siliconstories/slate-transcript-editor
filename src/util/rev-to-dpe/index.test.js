import convertRevToDpe, { isRevTranscript } from './index.js';

const rev = (monologues) => ({ monologues });
const textEl = (value, ts, end_ts) => ({ type: 'text', value, ts, end_ts, confidence: 0.9 });
const space = { type: 'punct', value: ' ' };
const punct = (value) => ({ type: 'punct', value });

const SAMPLE = rev([
  { speaker: 0, elements: [textEl('Ich', 1.46, 1.86), space, textEl('wollte', 1.86, 2.16), space, textEl('werden', 2.16, 2.96), punct('.')] },
  { speaker: 1, elements: [textEl('Es', 3.0, 3.2), space, textEl('war', 3.2, 3.4), space, textEl('Zufall', 3.4, 3.9), punct('?')] },
]);

describe('isRevTranscript', () => {
  it('is true for a rev.ai object', () => expect(isRevTranscript(SAMPLE)).toBe(true));
  it('is false for a DPE object', () => expect(isRevTranscript({ words: [], paragraphs: [] })).toBe(false));
  it('is false for non-objects', () => {
    expect(isRevTranscript(null)).toBe(false);
    expect(isRevTranscript('x')).toBe(false);
  });
});

describe('convertRevToDpe', () => {
  it('maps text elements to words with start/end/text and sequential ids', () => {
    const { words } = convertRevToDpe(SAMPLE);
    expect(words[0]).toEqual({ id: 0, start: 1.46, end: 1.86, text: 'Ich' });
    expect(words.length).toBe(6);
    expect(words.map((w) => w.id)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('glues non-space punctuation onto the preceding word', () => {
    const { words } = convertRevToDpe(SAMPLE);
    expect(words.find((w) => w.text.startsWith('werden')).text).toBe('werden.');
    expect(words.find((w) => w.text.startsWith('Zufall')).text).toBe('Zufall?');
  });

  it('ignores whitespace-only punctuation', () => {
    const { words } = convertRevToDpe(SAMPLE);
    expect(words.some((w) => w.text === ' ')).toBe(false);
  });

  it('labels numeric speakers 1-indexed', () => {
    const { paragraphs } = convertRevToDpe(SAMPLE);
    expect(paragraphs[0].speaker).toBe('Speaker 1');
    expect(paragraphs[paragraphs.length - 1].speaker).toBe('Speaker 2');
  });

  it('always splits on speaker (monologue) change', () => {
    const { paragraphs } = convertRevToDpe(SAMPLE);
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(paragraphs[0].start).toBe(1.46);
    expect(paragraphs[0].end).toBe(2.96);
  });

  it('splits a long monologue at sentence boundaries past the target length', () => {
    const els = [];
    let t = 0;
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 5; i++) {
        els.push(textEl(`w${s}_${i}`, t, t + 0.1));
        t += 0.1;
        if (i < 4) els.push(space);
      }
      els.push(punct('.'));
    }
    const { paragraphs, words } = convertRevToDpe(rev([{ speaker: 0, elements: els }]), { wordsPerParagraph: 5 });
    expect(words.length).toBe(15);
    expect(paragraphs.length).toBe(3);
    for (let i = 1; i < paragraphs.length; i++) {
      expect(paragraphs[i].start).toBeGreaterThanOrEqual(paragraphs[i - 1].end);
    }
  });

  it('force-splits when a long run has no sentence punctuation', () => {
    const els = [];
    let t = 0;
    for (let i = 0; i < 20; i++) {
      els.push(textEl(`w${i}`, t, t + 0.1));
      t += 0.1;
      if (i < 19) els.push(space);
    }
    const { paragraphs } = convertRevToDpe(rev([{ speaker: 0, elements: els }]), { wordsPerParagraph: 5 });
    expect(paragraphs.length).toBeGreaterThan(1);
  });

  it('handles empty / malformed input', () => {
    expect(convertRevToDpe(rev([]))).toEqual({ words: [], paragraphs: [] });
    expect(convertRevToDpe(rev([{ speaker: 0, elements: [] }]))).toEqual({ words: [], paragraphs: [] });
    expect(() => convertRevToDpe({})).toThrow();
  });
});
