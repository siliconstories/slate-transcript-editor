import { buildConfidenceDecorations } from './index';

// Build a paragraph the way the editor does: one text leaf = words joined by ' '.
const para = (words) => ({ type: 'timedText', children: [{ text: words.map((w) => w.text).join(' '), words }] });

const WORD = { overlay: true, level: 'word', cutoff: 0.85, floor: 0.55 };

describe('buildConfidenceDecorations — word mode', () => {
  it('decorates only below-cutoff words, with offsets matching the join rule', () => {
    const value = [
      para([
        { text: 'Hello', start: 0, end: 1, confidence: 0.99 },
        { text: 'world', start: 1, end: 2, confidence: 0.5 },
        { text: 'again', start: 2, end: 3, confidence: 0.95 },
      ]),
    ];
    const { enabled, byPara } = buildConfidenceDecorations(value, WORD);
    expect(enabled).toBe(true);
    expect(byPara[0]).toHaveLength(1);
    // "Hello world again" -> world occupies [6, 11]
    expect(byPara[0][0].charStart).toBe(6);
    expect(byPara[0][0].charEnd).toBe(11);
    expect(byPara[0][0].confidenceStyle).toMatch(/^hsla\(/);
  });

  it('coalesces adjacent equal-band words into one range (incl. the space)', () => {
    const value = [
      para([
        { text: 'aa', start: 0, end: 1, confidence: 0.5 },
        { text: 'bb', start: 1, end: 2, confidence: 0.5 },
      ]),
    ];
    const { byPara } = buildConfidenceDecorations(value, WORD);
    expect(byPara[0]).toHaveLength(1);
    expect(byPara[0][0]).toMatchObject({ charStart: 0, charEnd: 5 }); // "aa bb"
  });
});

describe('buildConfidenceDecorations — sentence mode', () => {
  it('washes only the low-confidence sentence, spanning its words', () => {
    const value = [
      para([
        { text: 'Hi', start: 0, end: 1, confidence: 0.99 },
        { text: 'there', start: 1, end: 2, confidence: 0.99, punctAfter: '.' },
        { text: 'Bad', start: 2, end: 3, confidence: 0.4 },
        { text: 'word', start: 3, end: 4, confidence: 0.4, punctAfter: '.' },
      ]),
    ];
    const { byPara } = buildConfidenceDecorations(value, { ...WORD, level: 'sentence', sentenceMetric: 'mean' });
    expect(byPara[0]).toHaveLength(1);
    // "Hi there Bad word" -> "Bad word" occupies [9, 17]
    expect(byPara[0][0]).toMatchObject({ charStart: 9, charEnd: 17 });
  });
});

describe('buildConfidenceDecorations — no-op cases', () => {
  it('is disabled when the overlay is off', () => {
    const value = [para([{ text: 'x', start: 0, end: 1, confidence: 0.4 }])];
    expect(buildConfidenceDecorations(value, { overlay: false })).toEqual({ enabled: false, byPara: [] });
  });

  it('is disabled when no word carries a numeric confidence (classic DPE)', () => {
    const value = [
      para([
        { text: 'no', start: 0, end: 1 },
        { text: 'conf', start: 1, end: 2 },
      ]),
    ];
    expect(buildConfidenceDecorations(value, WORD)).toEqual({ enabled: false, byPara: [] });
  });
});
