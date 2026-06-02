import { createWhisperProfile } from '../../transcript-model/whisper-profile';
import slateToText from '../export-adapters/txt/index.js';
import stripMutedWords from './index.js';

// A small WhisperX transcript (no dependency on sample fixtures).
const W = (word, start, end) => ({ word, start, end, score: 0.95, speaker: 'SPEAKER_00' });
const SEGMENTS = [
  {
    start: 0,
    end: 1.5,
    text: 'alpha bravo charlie',
    speaker: 'SPEAKER_00',
    words: [W('alpha', 0, 0.5), W('bravo', 0.5, 1.0), W('charlie', 1.0, 1.5)],
  },
];
const WHISPERX = { segments: SEGMENTS, word_segments: SEGMENTS.flatMap((s) => s.words), annotation_metadata: { chunks: [] } };

describe('muted word round-trip', () => {
  it('keeps muted words (muted:true) in the editor value but removes them from text export', () => {
    const profile = createWhisperProfile();
    const { value } = profile.import(WHISPERX);
    // mute "bravo"
    value[0].children[0].words[1].muted = true;

    // The editor value retains the muted word + flag (so it is reversible / faithfully exportable)
    const bravo = value[0].children[0].words.find((w) => w.text === 'bravo');
    expect(bravo).toBeTruthy();
    expect(bravo.muted).toBe(true);

    // Faithful export drops the muted word (rev/whisperx mute removes it from the schema)
    profile.versioning.snapshot(value);
    const faithful = profile.exporters[0].run();
    expect(JSON.stringify(faithful)).not.toContain('bravo');

    // TEXT export: muted word must be gone, others kept
    const txt = slateToText({ value: stripMutedWords(value), speakers: false, timecodes: false });
    expect(txt).toContain('alpha');
    expect(txt).toContain('charlie');
    expect(txt).not.toContain('bravo');
  });
});
