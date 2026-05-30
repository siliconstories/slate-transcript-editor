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

  it('skips empty-text words but keeps following offsets aligned', () => {
    // DPE alignment placeholders have text "" and must not become highlight targets
    const words = [w('So', 1.0, 1.2), w('', 1.21, 1.22), w('me', 1.3, 1.5)];
    const value = [paragraph(words)];
    const joined = value[0].children[0].text; // "So  me" (double space from empty word)
    const map = buildWordMap(value);
    expect(map.length).toBe(2);
    expect(joined.slice(map[0].charStart, map[0].charEnd)).toBe('So');
    expect(joined.slice(map[1].charStart, map[1].charEnd)).toBe('me');
    map.forEach((e) => expect(e.charEnd).toBeGreaterThan(e.charStart));
  });

  it('returns entries sorted ascending by start (DPE words can be out of order)', () => {
    // first paragraph starts later in time than the second on purpose
    const value = [paragraph([w('late', 10, 11)]), paragraph([w('early', 1, 2)])];
    const map = buildWordMap(value);
    expect(map.map((m) => m.start)).toEqual([1, 10]);
    expect(map[0].pIdx).toBe(1); // the early word came from the second paragraph
  });

  it('handles empty / missing words arrays without throwing', () => {
    expect(buildWordMap([{ type: 'timedText', children: [{ text: '' }] }])).toEqual([]);
    expect(buildWordMap([{}])).toEqual([]);
  });
});
