import convertDpeToSlate from '../dpe-to-slate/index.js';
import converSlateToDpe from '../export-adapters/slate-to-dpe/index.js';
import slateToText from '../export-adapters/txt/index.js';
import stripMutedWords from './index.js';

// A small, self-contained DPE transcript (no dependency on sample fixtures).
const DPE = {
  words: [
    { id: 0, start: 0.0, end: 0.5, text: 'alpha' },
    { id: 1, start: 0.5, end: 1.0, text: 'bravo' },
    { id: 2, start: 1.0, end: 1.5, text: 'charlie' },
  ],
  paragraphs: [{ id: 0, start: 0.0, end: 1.5, speaker: 'Speaker 1' }],
};

describe('muted word round-trip', () => {
  it('keeps muted words (muted:true) in the saved DPE but removes them from text export', () => {
    const value = convertDpeToSlate(DPE);
    // mute "bravo"
    value[0].children[0].words[1].muted = true;

    // SAVE (json-digitalpaperedit): muted word + flag must persist
    const saved = converSlateToDpe(value);
    const savedBravo = saved.words.find((w) => w.text === 'bravo');
    expect(savedBravo).toBeTruthy();
    expect(savedBravo.muted).toBe(true);

    // TEXT export: muted word must be gone, others kept
    const txt = slateToText({ value: stripMutedWords(value), speakers: false, timecodes: false });
    expect(txt).toContain('alpha');
    expect(txt).toContain('charlie');
    expect(txt).not.toContain('bravo');
  });
});
