import {
  revToModel,
  projectRev,
  isRevTranscript,
  REV_KEY,
  setWordValue,
  setWordMuted,
  revertWord,
  newHistory,
  commit,
  undo,
  redo,
  currentOverlay,
  canUndo,
  canRedo,
} from './rev-overlay.js';

const txt = (value, ts, end_ts, confidence) => {
  const e = { type: 'text', value, ts, end_ts };
  if (typeof confidence === 'number') e.confidence = confidence;
  return e;
};
const sp = { type: 'punct', value: ' ' };
const pn = (v) => ({ type: 'punct', value: v });

// Deliberately includes the adversarial traps:
//  - leading/orphan punct in m1 (the '-')
//  - an untimed text element (no ts/end_ts): "beta"
//  - a token with NO confidence field: "gamma"
//  - duplicate word value ("the" twice) for anchor-routing
//  - surrounding punctuation kept as separate elements
const SAMPLE = {
  monologues: [
    {
      speaker: 0,
      elements: [txt('the', 0.0, 0.2, 0.9), sp, txt('cat', 0.2, 0.4, 0.8), sp, txt('sat', 0.4, 0.6, 0.99), pn('.')],
    },
    {
      speaker: 1,
      elements: [
        pn('-'),
        txt('the', 1.0, 1.2, 0.7),
        sp,
        txt('beta'),
        sp, // untimed
        txt('gamma', 1.4, 1.6),
        pn('!'), // no confidence
      ],
    },
  ],
};

describe('isRevTranscript', () => {
  it('detects rev.ai vs DPE', () => {
    expect(isRevTranscript(SAMPLE)).toBe(true);
    expect(isRevTranscript({ words: [], paragraphs: [] })).toBe(false);
    expect(isRevTranscript(null)).toBe(false);
  });
});

describe('revToModel', () => {
  it('extracts only text elements with original-index anchors (single walk)', () => {
    const { words } = revToModel(SAMPLE);
    expect(words.map((w) => w.value)).toEqual(['the', 'cat', 'sat', 'the', 'beta', 'gamma']);
    // m0: text at elem indices 0,2,4 ; m1: text at 1,3,5
    expect(words.map((w) => w.key)).toEqual(['0:0', '0:2', '0:4', '1:1', '1:3', '1:5']);
  });

  it('dropping/untimed elements do NOT shift following anchors', () => {
    const { words } = revToModel(SAMPLE);
    const beta = words.find((w) => w.value === 'beta');
    const gamma = words.find((w) => w.value === 'gamma');
    expect(beta.key).toBe('1:3');
    expect(beta.start).toBe(null); // untimed preserved as null, still anchored
    expect(gamma.key).toBe('1:5');
  });

  it('tracks confidence presence/absence', () => {
    const { words } = revToModel(SAMPLE);
    expect(words.find((w) => w.value === 'sat').confidence).toBe(0.99);
    expect(words.find((w) => w.value === 'gamma').hasConfidence).toBe(false);
  });

  it('freezes the original', () => {
    const { original } = revToModel(SAMPLE);
    expect(Object.isFrozen(original)).toBe(true);
    expect(() => {
      original.monologues[0].elements[0].value = 'X';
    }).toThrow();
  });
});

describe('projectRev (faithful export)', () => {
  it('empty overlay round-trips byte-identical to original', () => {
    const { original } = revToModel(SAMPLE);
    expect(projectRev(original, {})).toEqual(SAMPLE);
  });

  it('rewrite sets value + confidence 1.0; mute blanks value + confidence 1.0', () => {
    const { original } = revToModel(SAMPLE);
    const overlay = {
      [REV_KEY(0, 2)]: { value: 'dog' }, // rewrite "cat" -> "dog"
      [REV_KEY(0, 4)]: { muted: true }, // mute "sat"
    };
    const out = projectRev(original, overlay);
    const m0 = out.monologues[0].elements;
    expect(m0[2]).toEqual({ type: 'text', value: 'dog', ts: 0.2, end_ts: 0.4, confidence: 1.0 });
    expect(m0[4]).toEqual({ type: 'text', value: '', ts: 0.4, end_ts: 0.6, confidence: 1.0 });
    // element count + punctuation + order all preserved
    expect(out.monologues[0].elements.length).toBe(SAMPLE.monologues[0].elements.length);
    expect(m0[3]).toEqual({ type: 'punct', value: ' ' }); // space after "cat"
    expect(m0[5]).toEqual({ type: 'punct', value: '.' }); // sentence period preserved
    // untouched words unchanged, incl. absent-confidence "gamma"
    expect(out.monologues[1].elements[5]).toEqual({ type: 'text', value: 'gamma', ts: 1.4, end_ts: 1.6 });
    // speakers preserved as numeric
    expect(out.monologues[0].speaker).toBe(0);
    expect(out.monologues[1].speaker).toBe(1);
  });

  it('routes duplicate word values to the correct occurrence by anchor', () => {
    const { original } = revToModel(SAMPLE);
    const out = projectRev(original, { [REV_KEY(1, 1)]: { value: 'THE2' } });
    expect(out.monologues[0].elements[0].value).toBe('the'); // first "the" untouched
    expect(out.monologues[1].elements[1].value).toBe('THE2'); // second "the" edited
  });

  it('does NOT mutate the frozen original', () => {
    const { original } = revToModel(SAMPLE);
    projectRev(original, { [REV_KEY(0, 0)]: { value: 'X' } });
    expect(original.monologues[0].elements[0].value).toBe('the');
  });

  it('throws if an anchor does not resolve to a text element', () => {
    const { original } = revToModel(SAMPLE);
    expect(() => projectRev(original, { '0:1': { value: 'x' } })).toThrow(); // 0:1 is a punct
    expect(() => projectRev(original, { '9:9': { value: 'x' } })).toThrow();
  });
});

describe('overlay edit helpers', () => {
  it('setWordValue records a rewrite and clears when reset to original', () => {
    let o = {};
    o = setWordValue(o, '0:2', 'dog', 'cat');
    expect(o['0:2']).toEqual({ value: 'dog' });
    o = setWordValue(o, '0:2', 'cat', 'cat'); // back to original
    expect(o['0:2']).toBeUndefined();
  });

  it('setWordMuted toggles and clears', () => {
    let o = setWordMuted({}, '0:4', true);
    expect(o['0:4']).toEqual({ muted: true });
    o = setWordMuted(o, '0:4', false);
    expect(o['0:4']).toBeUndefined();
  });

  it('mute + rewrite coexist on one word, revertWord clears both', () => {
    let o = setWordValue({}, '0:2', 'dog', 'cat');
    o = setWordMuted(o, '0:2', true);
    expect(o['0:2']).toEqual({ value: 'dog', muted: true });
    o = revertWord(o, '0:2');
    expect(o['0:2']).toBeUndefined();
  });
});

describe('snapshot history', () => {
  it('commit/undo/redo navigate overlay states', () => {
    let h = newHistory();
    expect(canUndo(h)).toBe(false);
    h = commit(h, { '0:2': { value: 'dog' } });
    h = commit(h, { '0:2': { value: 'dog' }, '0:4': { muted: true } });
    expect(currentOverlay(h)['0:4']).toEqual({ muted: true });
    h = undo(h);
    expect(currentOverlay(h)['0:4']).toBeUndefined();
    expect(currentOverlay(h)['0:2']).toEqual({ value: 'dog' });
    h = undo(h);
    expect(currentOverlay(h)).toEqual({}); // back to original
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(currentOverlay(h)['0:2']).toEqual({ value: 'dog' });
  });

  it('a new commit after undo truncates the redo tail', () => {
    let h = newHistory();
    h = commit(h, { a: { value: '1' } });
    h = commit(h, { a: { value: '2' } });
    h = undo(h); // back at "1"
    h = commit(h, { a: { value: '3' } });
    expect(canRedo(h)).toBe(false);
    expect(currentOverlay(h)).toEqual({ a: { value: '3' } });
  });
});
