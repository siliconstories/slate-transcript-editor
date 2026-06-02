import { registerProfile, getProfile, detectProfile, resolveProfile } from './profile';

const REV = { monologues: [{ speaker: 0, elements: [{ type: 'text', value: 'hi', ts: 0, end_ts: 0.2, confidence: 1 }] }] };
const DPE = { words: [{ start: 0, end: 0.2, text: 'hi' }], paragraphs: [{ start: 0, end: 0.2, speaker: 'A' }] };
const WORD = { word: 'hi', start: 0, end: 0.2, score: 0.9, speaker: 'SPEAKER_00' };
const WHISPERX = {
  segments: [{ start: 0, end: 0.2, text: 'hi', speaker: 'SPEAKER_00', words: [WORD] }],
  word_segments: [WORD],
  annotation_metadata: { chunks: [] },
};

describe('profile registry — single unified whisper tier', () => {
  it('resolveProfile(nullish) -> a fresh whisper profile', () => {
    expect(resolveProfile(undefined).id).toBe('whisper');
    expect(resolveProfile(null).id).toBe('whisper');
    // word-level-only strict tier (no free-text DPE default any more)
    expect(resolveProfile(undefined).editPolicy.wordLevelOnly).toBe(true);
    expect(resolveProfile(undefined).editPolicy.allowsStructuralEdits).toBe(false);
  });

  it('resolveProfile(legacy/unknown string id) -> whisper', () => {
    expect(resolveProfile('whisper').id).toBe('whisper');
    expect(resolveProfile('rigid').id).toBe('whisper'); // legacy id maps to the unified tier
    expect(resolveProfile('whisperx').id).toBe('whisper');
    expect(resolveProfile('does-not-exist').id).toBe('whisper');
  });

  it('resolveProfile(instance) -> returned as-is', () => {
    const instance = resolveProfile('whisper');
    expect(resolveProfile(instance)).toBe(instance);
  });

  it('detectProfile routes rev.ai and WhisperX -> whisper; throws on anything else', () => {
    expect(detectProfile(REV).id).toBe('whisper');
    expect(detectProfile(WHISPERX).id).toBe('whisper');
    expect(() => detectProfile(DPE)).toThrow(/unrecognized transcript/);
    expect(() => detectProfile({})).toThrow(/unrecognized transcript/);
  });

  it('whisperx detection needs BOTH segments and word_segments (segments-only -> not detected)', () => {
    expect(() => detectProfile({ segments: WHISPERX.segments })).toThrow(/unrecognized transcript/);
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
    expect(detectProfile({ __x: true }).id).toBe('demo-x'); // a custom detector is honored
    expect(getProfile('nope')).toBeUndefined();
  });

  it('registerProfile rejects a malformed descriptor', () => {
    expect(() => registerProfile({ id: 'bad' })).toThrow();
  });
});
