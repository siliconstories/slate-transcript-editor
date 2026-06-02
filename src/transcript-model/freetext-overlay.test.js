import { freeTextOverlayFromSlate } from './freetext-overlay.js';

const MODEL = {
  words: [
    { key: '0:0', value: 'the', start: 0.0, end: 0.2, confidence: 0.9 },
    { key: '0:2', value: 'cat', start: 1.0, end: 1.2, confidence: 0.8 },
    { key: '0:4', value: 'sat', start: 1.2, end: 1.6, confidence: 0.99 },
    { key: '1:1', value: 'hello', start: 2.0, end: 2.2 },
    { key: '1:3', value: 'world', start: 2.2, end: 2.6 },
  ],
};

// Build one leaf word from a model key (a faithful survivor) with optional overrides.
const survivor = (key, over = {}) => {
  const m = MODEL.words.find((w) => w.key === key);
  return { _key: key, text: m.value, start: m.start, end: m.end, confidence: m.confidence ?? null, estimated: false, ...over };
};
const inserted = (text, start, end) => ({ _key: null, text, start, end, confidence: null, estimated: true });

const para = (firstWordKey, lastWordKey, words) => ({
  type: 'timedText',
  anchorKey: firstWordKey,
  span: { firstWordKey, lastWordKey },
  children: [{ text: words.map((w) => w.text).join(' '), words }],
});

const A = (words) => para('0:0', '0:4', words);
const B = (words) => para('1:1', '1:3', words);
const CLEAN_A = [survivor('0:0'), survivor('0:2'), survivor('0:4')];
const CLEAN_B = [survivor('1:1'), survivor('1:3')];

describe('freeTextOverlayFromSlate — clean detection', () => {
  it('an unedited value yields an empty overlay', () => {
    expect(freeTextOverlayFromSlate(MODEL, [A(CLEAN_A), B(CLEAN_B)])).toEqual({});
  });
});

describe('freeTextOverlayFromSlate — edits', () => {
  it('a rewrite produces one paragraph entry with the new token value', () => {
    const ov = freeTextOverlayFromSlate(MODEL, [A([survivor('0:0'), survivor('0:2', { text: 'dog' }), survivor('0:4')]), B(CLEAN_B)]);
    expect(Object.keys(ov)).toEqual(['para:0:0']);
    expect(ov['para:0:0'].kind).toBe('freetext');
    expect(ov['para:0:0'].tokens.map((t) => t.value)).toEqual(['the', 'dog', 'sat']);
    expect(ov['para:0:0'].tokens[1].ref).toBe('0:2'); // survivor keeps its anchor + timing
    expect(ov['para:0:0'].tokens[1].start).toBe(1.0);
  });

  it('an insertion records the new (anchorless, estimated) token', () => {
    const ov = freeTextOverlayFromSlate(MODEL, [A([survivor('0:0'), inserted('big', 0.2, 1.0), survivor('0:2'), survivor('0:4')]), B(CLEAN_B)]);
    const t = ov['para:0:0'].tokens;
    expect(t.map((x) => x.value)).toEqual(['the', 'big', 'cat', 'sat']);
    expect(t[1].ref).toBeNull();
    expect(t[1].estimated).toBe(true);
  });

  it('a deletion is detected (fewer tokens than the original span)', () => {
    const ov = freeTextOverlayFromSlate(MODEL, [A([survivor('0:0'), survivor('0:4')]), B(CLEAN_B)]);
    expect(Object.keys(ov)).toEqual(['para:0:0']);
    expect(ov['para:0:0'].tokens.map((t) => t.ref)).toEqual(['0:0', '0:4']);
  });

  it('a mute is carried on the token', () => {
    const ov = freeTextOverlayFromSlate(MODEL, [A([survivor('0:0'), survivor('0:2', { muted: true }), survivor('0:4')]), B(CLEAN_B)]);
    expect(ov['para:0:0'].tokens[1].muted).toBe(true);
  });

  it('only edited paragraphs produce entries', () => {
    const ov = freeTextOverlayFromSlate(MODEL, [A(CLEAN_A), B([survivor('1:1', { text: 'HELLO' }), survivor('1:3')])]);
    expect(Object.keys(ov)).toEqual(['para:1:1']);
  });
});

describe('freeTextOverlayFromSlate — invariants reject corruption', () => {
  it('returns null on an out-of-order survivor anchor', () => {
    expect(freeTextOverlayFromSlate(MODEL, [A([survivor('0:2'), survivor('0:0'), survivor('0:4')])])).toBeNull();
  });
  it('returns null on a duplicate survivor anchor', () => {
    expect(freeTextOverlayFromSlate(MODEL, [A([survivor('0:0'), survivor('0:0'), survivor('0:4')])])).toBeNull();
  });
  it('returns null on an unknown survivor anchor', () => {
    const bogus = { _key: '9:9', text: 'x', start: 0, end: 0, confidence: null, estimated: false };
    expect(freeTextOverlayFromSlate(MODEL, [A([survivor('0:0'), bogus, survivor('0:4')])])).toBeNull();
  });
});

describe('freeTextOverlayFromSlate — anchorless paragraphs are skipped', () => {
  it('a paragraph with no anchor/survivors contributes nothing', () => {
    const wordless = { type: 'timedText', children: [{ text: 'um', words: [] }] };
    expect(freeTextOverlayFromSlate(MODEL, [A(CLEAN_A), B(CLEAN_B), wordless])).toEqual({});
  });
});
