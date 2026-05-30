import buildWordMap from './index.js';

const paragraph = (words, extra = {}) => ({
  type: 'timedText',
  start: words.length ? words[0].start : 0,
  ...extra,
  children: [{ text: words.map((w) => w.text).join(' '), words }],
});

const w = (text, start, end) => ({ text, start, end });

describe('buildWordMap', () => {
  it('returns [] for non-array input', () => {
    expect(buildWordMap(null)).toEqual([]);
    expect(buildWordMap(undefined)).toEqual([]);
  });

  it('computes char offsets matching the joined text', () => {
    const words = [w('So', 1.0, 1.2), w('tell', 1.2, 1.5), w('me', 1.5, 1.7)];
    const value = [paragraph(words)];
    const joined = value[0].children[0].text; // "So tell me"
    const map = buildWordMap(value);
    expect(map.length).toBe(3);
    map.forEach((entry) => {
      expect(joined.slice(entry.charStart, entry.charEnd)).toBe(words[entry === map[0] ? 0 : map.indexOf(entry)].text);
    });
    expect(joined.slice(map[0].charStart, map[0].charEnd)).toBe('So');
    expect(joined.slice(map[1].charStart, map[1].charEnd)).toBe('tell');
    expect(joined.slice(map[2].charStart, map[2].charEnd)).toBe('me');
  });

  it('carries start/end and the leaf path', () => {
    const map = buildWordMap([paragraph([w('Hi', 2.0, 2.4)])]);
    expect(map[0]).toMatchObject({ pIdx: 0, path: [0, 0], start: 2.0, end: 2.4, charStart: 0, charEnd: 2 });
  });

  it('offsets are per-paragraph (reset each paragraph)', () => {
    const value = [paragraph([w('A', 0, 1), w('BB', 1, 2)]), paragraph([w('CCC', 3, 4)])];
    const map = buildWordMap(value);
    // second paragraph's first word starts at offset 0 again
    const p1 = map.filter((m) => m.pIdx === 1);
    expect(p1[0].charStart).toBe(0);
    expect(p1[0].charEnd).toBe(3);
    expect(value[1].children[0].text.slice(0, 3)).toBe('CCC');
  });

  it('handles punctuation-glued words (no extra offset drift)', () => {
    const words = [w('werden.', 1, 2), w('Es', 2, 3)];
    const value = [paragraph(words)];
    const joined = value[0].children[0].text; // "werden. Es"
    const map = buildWordMap(value);
    expect(joined.slice(map[0].charStart, map[0].charEnd)).toBe('werden.');
    expect(joined.slice(map[1].charStart, map[1].charEnd)).toBe('Es');
  });

  it('handles empty / missing words arrays without throwing', () => {
    expect(buildWordMap([{ type: 'timedText', children: [{ text: '' }] }])).toEqual([]);
    expect(buildWordMap([{}])).toEqual([]);
  });
});
