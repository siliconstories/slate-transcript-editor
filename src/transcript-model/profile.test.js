import { registerProfile, getProfile, detectProfile, resolveProfile } from './profile';

const REV = { monologues: [{ speaker: 0, elements: [{ type: 'text', value: 'hi', ts: 0, end_ts: 0.2, confidence: 1 }] }] };
const DPE = { words: [{ start: 0, end: 0.2, text: 'hi' }], paragraphs: [{ start: 0, end: 0.2, speaker: 'A' }] };

describe('profile registry', () => {
  it('resolveProfile(nullish) -> classic', () => {
    expect(resolveProfile(undefined).id).toBe('classic');
    expect(resolveProfile(null).id).toBe('classic');
    expect(resolveProfile(undefined).editPolicy.allowsStructuralEdits).toBe(true);
  });

  it('resolveProfile(string id) -> fresh instance from registry', () => {
    const rigid = resolveProfile('rigid');
    expect(rigid.id).toBe('rigid');
    expect(rigid.editPolicy.wordLevelOnly).toBe(true);
  });

  it('resolveProfile(unknown id) -> classic fallback', () => {
    expect(resolveProfile('does-not-exist').id).toBe('classic');
  });

  it('resolveProfile(instance) -> returned as-is', () => {
    const instance = resolveProfile('rigid');
    expect(resolveProfile(instance)).toBe(instance);
  });

  it('detectProfile routes rev.ai -> rigid, DPE -> classic', () => {
    expect(detectProfile(REV).id).toBe('rigid');
    expect(detectProfile(DPE).id).toBe('classic');
  });

  it('registerProfile + getProfile round-trip; getProfile returns a fresh instance', () => {
    const descriptor = {
      id: 'demo-x',
      detect: (p) => Boolean(p && p.__x),
      create: () => ({ id: 'demo-x', editPolicy: {}, import: () => ({ value: [], model: null }) }),
    };
    registerProfile(descriptor);
    expect(getProfile('demo-x').id).toBe('demo-x');
    expect(getProfile('demo-x')).not.toBe(getProfile('demo-x')); // fresh each call
    expect(detectProfile({ __x: true }).id).toBe('demo-x'); // a custom detector wins over classic
    expect(getProfile('nope')).toBeUndefined();
  });

  it('registerProfile rejects a malformed descriptor', () => {
    expect(() => registerProfile({ id: 'bad' })).toThrow();
  });
});
