/**
 * Golden snapshots for the pure export/import transforms, captured on the
 * pre-modernization stack. These guard the round-trip (dpe -> slate -> {txt, dpe})
 * across every later migration phase. The docx adapter has its own golden suite
 * (./docx/index.test.js) because it requires unzipping the .docx output.
 */
import convertDpeToSlate from '../dpe-to-slate';
import slateToText from './txt';
import converSlateToDpe from './slate-to-dpe';
import DPE from './__fixtures__/golden-dpe.json';

const slateValue = convertDpeToSlate(DPE);

describe('dpe-to-slate (golden)', () => {
  it('converts a DPE transcript into the timedText Slate node shape', () => {
    expect(slateValue).toMatchSnapshot();
  });

  it('produces one block per paragraph with the expected speakers + text', () => {
    expect(slateValue).toHaveLength(2);
    expect(slateValue.map((b) => b.speaker)).toEqual(['Alice', 'Bob']);
    expect(slateValue.map((b) => b.type)).toEqual(['timedText', 'timedText']);
    expect(slateValue[0].children[0].text).toBe('Hello world this is Alice');
    expect(slateValue[1].children[0].text).toBe('And now Bob speaks');
  });
});

describe('slate-to-dpe (golden)', () => {
  const dpe = converSlateToDpe(slateValue);

  it('round-trips Slate back to DPE words + paragraphs', () => {
    expect(dpe).toMatchSnapshot();
  });

  it('preserves every word and paragraph speaker/timing', () => {
    expect(dpe.words).toHaveLength(DPE.words.length);
    expect(dpe.paragraphs.map((p) => p.speaker)).toEqual(['Alice', 'Bob']);
    expect(dpe.paragraphs[0].start).toBe(0);
    expect(dpe.paragraphs[1].end).toBe(5);
  });
});

describe('slate-to-text (golden)', () => {
  it.each([
    ['plain', { speakers: false, timecodes: false }],
    ['speakers', { speakers: true, timecodes: false }],
    ['timecodes', { speakers: false, timecodes: true }],
    ['speakers+timecodes', { speakers: true, timecodes: true }],
    ['atlasFormat', { speakers: true, timecodes: true, atlasFormat: true }],
  ])('renders text for the %s option set', (_label, opts) => {
    expect(slateToText({ value: slateValue, ...opts })).toMatchSnapshot();
  });
});
