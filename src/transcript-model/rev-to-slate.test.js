import { revToModel, newHistory, commit, setWordValue, setWordMuted } from './rev-overlay.js';
import revModelToSlate from './rev-to-slate.js';

const txt = (value, ts, end_ts, confidence) => {
  const e = { type: 'text', value, ts, end_ts };
  if (typeof confidence === 'number') e.confidence = confidence;
  return e;
};
const sp = { type: 'punct', value: ' ' };
const pn = (v) => ({ type: 'punct', value: v });

const SAMPLE = {
  monologues: [
    { speaker: 0, elements: [txt('the', 0, 0.2, 0.9), sp, txt('cat', 0.2, 0.4, 0.8), sp, txt('sat', 0.4, 0.6, 0.99), pn('.')] },
    { speaker: 1, elements: [txt('and', 1.0, 1.2, 0.7), sp, txt('ran', 1.2, 1.4, 0.95), pn('.')] },
  ],
};

describe('revModelToSlate', () => {
  it('projects words with stable _key and confidence onto Slate leaves', () => {
    const model = revToModel(SAMPLE);
    const value = revModelToSlate(model, newHistory());
    const w0 = value[0].children[0].words[0];
    expect(w0._key).toBe('0:0');
    expect(w0.text).toBe('the');
    expect(w0.confidence).toBe(0.9);
    expect(w0.punctAfter).toBe(''); // plain space after "the"
    expect(value[0].children[0].words[2].punctAfter).toBe('.'); // "sat" carries the period
  });

  it('splits paragraphs on speaker change with 1-indexed labels', () => {
    const model = revToModel(SAMPLE);
    const value = revModelToSlate(model, newHistory());
    expect(value.length).toBe(2);
    expect(value[0].speaker).toBe('Speaker 1');
    expect(value[1].speaker).toBe('Speaker 2');
    // Leaf text is the bare word join (no glued punctuation) — the offset convention.
    // `punctAfter` survives on the word objects for faithful export.
    expect(value[0].children[0].text).toBe('the cat sat');
    expect(value[1].children[0].text).toBe('and ran');
  });

  it('keeps word count constant; reflects overlay rewrite in display text', () => {
    const model = revToModel(SAMPLE);
    let h = newHistory();
    h = commit(h, setWordValue({}, '0:2', 'dog', 'cat')); // rewrite "cat"->"dog"
    const value = revModelToSlate(model, h);
    expect(value[0].children[0].words.length).toBe(3); // count unchanged
    expect(value[0].children[0].text).toBe('the dog sat');
    expect(value[0].children[0].words[1]._key).toBe('0:2');
  });

  it('muted word shows ORIGINAL text in editor with muted flag (blanking is export-only)', () => {
    const model = revToModel(SAMPLE);
    let h = newHistory();
    h = commit(h, setWordMuted({}, '0:4', true)); // mute "sat"
    const value = revModelToSlate(model, h);
    const sat = value[0].children[0].words[2];
    expect(sat.text).toBe('sat'); // still shows original text in the editor
    expect(sat.muted).toBe(true);
  });

  it('every projected word carries a unique present _key', () => {
    const model = revToModel(SAMPLE);
    const value = revModelToSlate(model, newHistory());
    const keys = value.flatMap((p) => p.children[0].words.map((w) => w._key));
    expect(keys).toEqual(['0:0', '0:2', '0:4', '1:0', '1:2']);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
