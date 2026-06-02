import { registerProfile, getProfile, detectProfile, resolveProfile } from './profile';

const REV = { monologues: [{ speaker: 0, elements: [{ type: 'text', value: 'hi', ts: 0, end_ts: 0.2, confidence: 1 }] }] };
const DPE = { words: [{ start: 0, end: 0.2, text: 'hi' }], paragraphs: [{ start: 0, end: 0.2, speaker: 'A' }] };
const WORD = { word: 'hi', start: 0, end: 0.2, score: 0.9, speaker: 'SPEAKER_00' };
const WHISPERX = {
  segments: [{ start: 0, end: 0.2, text: 'hi', speaker: 'SPEAKER_00', words: [WORD] }],
  word_segments: [WORD],
  annotation_metadata: { chunks: [] },
};

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

  it('detectProfile routes rev.ai -> rigid, WhisperX -> whisperx, DPE -> classic', () => {
    expect(detectProfile(REV).id).toBe('rigid');
    expect(detectProfile(WHISPERX).id).toBe('whisperx');
    expect(detectProfile(DPE).id).toBe('classic');
  });

  it('whisperx detection needs BOTH segments and word_segments (segments-only -> classic fallback)', () => {
    expect(detectProfile({ segments: WHISPERX.segments }).id).toBe('classic');
    const rigidWhisperx = resolveProfile('whisperx');
    expect(rigidWhisperx.id).toBe('whisperx');
    expect(rigidWhisperx.editPolicy.wordLevelOnly).toBe(true);
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
