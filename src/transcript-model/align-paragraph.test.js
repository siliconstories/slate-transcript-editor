import { alignParagraph, interpolateEstimated, splitOnWhiteSpaces } from './align-paragraph.js';

// gap between "the" (ends 0.2) and "cat" (starts 1.0) so inserted-word interpolation is visible
const WORDS = [
  { key: '0:0', value: 'the', start: 0.0, end: 0.2, confidence: 0.9 },
  { key: '0:2', value: 'cat', start: 1.0, end: 1.2, confidence: 0.8 },
  { key: '0:4', value: 'sat', start: 1.2, end: 1.6, confidence: 0.99 },
];

const isMonotonic = (tokens) => tokens.every((t, i) => t.start <= t.end + 1e-9 && (i === 0 || tokens[i - 1].start <= t.start + 1e-9));

describe('splitOnWhiteSpaces', () => {
  it('collapses whitespace and drops empties', () => {
    expect(splitOnWhiteSpaces('  the   cat sat  ')).toEqual(['the', 'cat', 'sat']);
    expect(splitOnWhiteSpaces('')).toEqual([]);
    expect(splitOnWhiteSpaces(null)).toEqual([]);
  });
});

describe('alignParagraph — survivors keep exact timing + anchor', () => {
  it('unchanged text keeps every original ts/end/confidence + ref', () => {
    const out = alignParagraph(WORDS, 'the cat sat');
    expect(out).toEqual([
      { ref: '0:0', value: 'the', start: 0.0, end: 0.2, confidence: 0.9, estimated: false },
      { ref: '0:2', value: 'cat', start: 1.0, end: 1.2, confidence: 0.8, estimated: false },
      { ref: '0:4', value: 'sat', start: 1.2, end: 1.6, confidence: 0.99, estimated: false },
    ]);
  });

  it('recase + punctuation edits keep the survivor timing (matched on normalised form)', () => {
    const out = alignParagraph(WORDS, 'The cat sat.');
    expect(out.map((t) => t.value)).toEqual(['The', 'cat', 'sat.']);
    expect(out.map((t) => t.ref)).toEqual(['0:0', '0:2', '0:4']);
    expect(out.every((t) => t.estimated === false)).toBe(true);
    expect(out[0].start).toBe(0.0); // exact original timing preserved
  });

  it('numbers/words collision (2 ~ two) is matched, so timing is inherited and raw value emitted', () => {
    const w = [
      { key: '0:0', value: 'i', start: 0, end: 0.1 },
      { key: '0:2', value: 'have', start: 0.1, end: 0.3 },
      { key: '0:4', value: '2', start: 0.3, end: 0.5 },
    ];
    const out = alignParagraph(w, 'I have two');
    expect(out.map((t) => t.ref)).toEqual(['0:0', '0:2', '0:4']);
    expect(out[2].value).toBe('two');
    expect(out[2].start).toBe(0.3);
    expect(out[2].estimated).toBe(false);
  });
});

describe('alignParagraph — insertions interpolate', () => {
  it('a mid-paragraph insert is timed inside the neighbour gap, flagged estimated', () => {
    const out = alignParagraph(WORDS, 'the big cat sat');
    expect(out.map((t) => t.value)).toEqual(['the', 'big', 'cat', 'sat']);
    const big = out[1];
    expect(big.ref).toBeNull();
    expect(big.estimated).toBe(true);
    expect(big.start).toBeCloseTo(0.2); // previous survivor end
    expect(big.end).toBeCloseTo(1.0); // next survivor start
    expect(out[0].ref).toBe('0:0'); // neighbours untouched
    expect(out[2].ref).toBe('0:2');
    expect(isMonotonic(out)).toBe(true);
  });

  it('multiple inserted words split the gap evenly', () => {
    const out = alignParagraph(WORDS, 'the very big cat sat');
    const [, very, big] = out;
    expect(very.estimated && big.estimated).toBe(true);
    expect(very.start).toBeCloseTo(0.2);
    expect(very.end).toBeCloseTo(0.6);
    expect(big.start).toBeCloseTo(0.6);
    expect(big.end).toBeCloseTo(1.0);
    expect(isMonotonic(out)).toBe(true);
  });
});

describe('alignParagraph — deletions + replacements', () => {
  it('a deleted word drops out; neighbours keep exact timing', () => {
    const out = alignParagraph(WORDS, 'the sat');
    expect(out.map((t) => t.ref)).toEqual(['0:0', '0:4']);
    expect(out[1].start).toBe(1.2);
    expect(isMonotonic(out)).toBe(true);
  });

  it('whole-paragraph replacement spreads across the original span, all estimated', () => {
    const out = alignParagraph(WORDS, 'dog ran fast');
    expect(out.every((t) => t.estimated && t.ref === null)).toBe(true);
    expect(out[0].start).toBeCloseTo(0.0); // paraStart
    expect(out[out.length - 1].end).toBeCloseTo(1.6); // paraEnd
    expect(isMonotonic(out)).toBe(true);
  });

  it('clearing the paragraph yields an empty token list', () => {
    expect(alignParagraph(WORDS, '')).toEqual([]);
    expect(alignParagraph(WORDS, '   ')).toEqual([]);
  });
});

describe('interpolateEstimated — degenerate interval', () => {
  it('collapses an inserted run to a zero-width point when there is no gap', () => {
    const tokens = [
      { ref: '0:0', value: 'a', start: 0.5, end: 0.5, confidence: null, estimated: false },
      { ref: null, value: 'x', start: null, end: null, confidence: null, estimated: true },
      { ref: '0:2', value: 'b', start: 0.5, end: 0.5, confidence: null, estimated: false },
    ];
    interpolateEstimated(tokens, 0.5, 0.5);
    expect(tokens[1].start).toBe(0.5);
    expect(tokens[1].end).toBe(0.5);
    expect(isMonotonic(tokens)).toBe(true);
  });
});
