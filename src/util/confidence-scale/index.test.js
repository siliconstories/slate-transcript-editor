import { confidenceToStyle, confidenceSeverity, confidenceBand, CONFIDENCE_BANDS } from './index';

const parseHsla = (s) => {
  const m = /hsla\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\)/.exec(s);
  if (!m) throw new Error(`not an hsla(): ${s}`);
  return { h: +m[1], s: +m[2], l: +m[3], a: +m[4] };
};

describe('confidenceSeverity', () => {
  it('is 0 at/above cutoff and null for non-numbers', () => {
    expect(confidenceSeverity(0.85, 0.85, 0.55)).toBe(0);
    expect(confidenceSeverity(0.99, 0.85, 0.55)).toBe(0);
    expect(confidenceSeverity(undefined)).toBeNull();
    expect(confidenceSeverity(NaN)).toBeNull();
    expect(confidenceSeverity('0.5')).toBeNull();
  });

  it('ramps 0..1 across [floor, cutoff] and clamps below floor', () => {
    expect(confidenceSeverity(0.7, 0.85, 0.55)).toBeCloseTo(0.5, 5);
    expect(confidenceSeverity(0.55, 0.85, 0.55)).toBe(1);
    expect(confidenceSeverity(0.2, 0.85, 0.55)).toBe(1);
  });
});

describe('confidenceToStyle', () => {
  it('returns null at/above cutoff and for missing confidence', () => {
    expect(confidenceToStyle(0.9)).toBeNull();
    expect(confidenceToStyle(0.85)).toBeNull();
    expect(confidenceToStyle(undefined)).toBeNull();
  });

  it('produces an hsla() warm wash below cutoff', () => {
    const style = confidenceToStyle(0.6);
    expect(style).toMatch(/^hsla\(/);
    const { h, s } = parseHsla(style);
    expect(s).toBe(95);
    expect(h).toBeGreaterThanOrEqual(8);
    expect(h).toBeLessThanOrEqual(45);
  });

  it('gets darker, redder, and more opaque as confidence falls (monotonic)', () => {
    const hi = parseHsla(confidenceToStyle(0.8)); // mild
    const lo = parseHsla(confidenceToStyle(0.56)); // severe
    expect(lo.a).toBeGreaterThan(hi.a); // more opaque
    expect(lo.l).toBeLessThan(hi.l); // darker
    expect(lo.h).toBeLessThan(hi.h); // hue shifts toward red
  });

  it('honors highlightOpacity as the max alpha at the floor', () => {
    const a = parseHsla(confidenceToStyle(0.55, { highlightOpacity: 0.3 })).a;
    expect(a).toBeCloseTo(0.3, 3);
  });
});

describe('confidenceBand', () => {
  it('buckets severity into 0..CONFIDENCE_BANDS', () => {
    expect(confidenceBand(0.95)).toBe(0);
    expect(confidenceBand(undefined)).toBe(0);
    expect(confidenceBand(0.55)).toBe(CONFIDENCE_BANDS);
    const band = confidenceBand(0.7);
    expect(band).toBeGreaterThanOrEqual(1);
    expect(band).toBeLessThanOrEqual(CONFIDENCE_BANDS);
  });
});
