import findActiveWord from './index.js';

const map = [{ start: 1.0 }, { start: 1.5 }, { start: 2.0 }, { start: 3.2 }];

describe('findActiveWord', () => {
  it('returns -1 before the first word', () => {
    expect(findActiveWord(map, 0)).toBe(-1);
    expect(findActiveWord(map, 0.99)).toBe(-1);
  });

  it('returns the word at its exact start', () => {
    expect(findActiveWord(map, 1.0)).toBe(0);
    expect(findActiveWord(map, 2.0)).toBe(2);
  });

  it('keeps a word active until the next one starts (gapless)', () => {
    expect(findActiveWord(map, 1.2)).toBe(0);
    expect(findActiveWord(map, 1.49)).toBe(0);
    expect(findActiveWord(map, 1.5)).toBe(1);
    expect(findActiveWord(map, 2.9)).toBe(2);
  });

  it('stays on the last word past the end', () => {
    expect(findActiveWord(map, 100)).toBe(3);
  });

  it('handles empty / invalid input', () => {
    expect(findActiveWord([], 5)).toBe(-1);
    expect(findActiveWord(null, 5)).toBe(-1);
    expect(findActiveWord(map, NaN)).toBe(-1);
  });
});
