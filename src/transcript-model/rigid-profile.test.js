import { createRigidProfile, rigidDescriptor } from './rigid-profile';

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
const DPE = { words: [{ start: 0, end: 0.2, text: 'hi' }], paragraphs: [{ start: 0, end: 0.2, speaker: 'A' }] };

const clone = (o) => JSON.parse(JSON.stringify(o));

describe('rigid profile', () => {
  it('descriptor detects rev.ai but not DPE', () => {
    expect(rigidDescriptor.id).toBe('rigid');
    expect(rigidDescriptor.detect(SAMPLE)).toBe(true);
    expect(rigidDescriptor.detect(DPE)).toBe(false);
  });

  it('import() yields a Slate value whose leaf words carry _key, confidence and glued punctuation', () => {
    const p = createRigidProfile();
    const { value, model } = p.import(SAMPLE);
    expect(Object.isFrozen(model.original)).toBe(true);
    const words = value[0].children[0].words;
    expect(words[0]._key).toBe('0:0');
    expect(words[0].confidence).toBe(0.9);
    expect(words[2].text).toBe('sat');
    expect(words[2].punctAfter).toBe('.'); // display-only punctuation
  });

  it('word-level-only, no structural edits, with word + freestyle modes', () => {
    const p = createRigidProfile();
    expect(p.editPolicy).toEqual({
      allowsStructuralEdits: false,
      allowsFreeText: false,
      wordLevelOnly: true,
      modes: ['word', 'freestyle'],
      defaultMode: 'word',
    });
  });

  it('faithful export with no edits round-trips byte-identical to the original', () => {
    const p = createRigidProfile();
    p.import(SAMPLE);
    expect(p.exporters[0].id).toBe('json-rev');
    expect(p.exporters[0].run()).toEqual(SAMPLE);
  });

  it('snapshot(rewrite) commits and the faithful export reflects it (value + confidence 1.0)', () => {
    const p = createRigidProfile();
    const { value } = p.import(SAMPLE);
    const edited = clone(value);
    edited[0].children[0].words[0].text = 'THE'; // rewrite "the" (0:0)
    expect(p.versioning.snapshot(edited)).toBe(true);
    const out = p.exporters[0].run();
    expect(out.monologues[0].elements[0]).toEqual({ type: 'text', value: 'THE', ts: 0, end_ts: 0.2, confidence: 1.0 });
    expect(out.monologues[0].elements[2].value).toBe('cat'); // untouched
    expect(out.monologues[0].elements[5]).toEqual({ type: 'punct', value: '.' }); // punct preserved
  });

  it('snapshot rejects a value that violates the word-count invariant', () => {
    const p = createRigidProfile();
    const { value } = p.import(SAMPLE);
    const broken = clone(value);
    broken[0].children[0].words.pop(); // drop a word -> count mismatch
    expect(p.versioning.snapshot(broken)).toBe(false);
    expect(p.exporters[0].run()).toEqual(SAMPLE); // history did not advance
  });

  it('revertAll clears edits so the export equals the original again', () => {
    const p = createRigidProfile();
    const { value } = p.import(SAMPLE);
    const edited = clone(value);
    edited[1].children[0].words[1].text = 'WALKED'; // rewrite "ran"
    p.versioning.snapshot(edited);
    expect(p.exporters[0].run()).not.toEqual(SAMPLE);
    p.versioning.revertAll();
    expect(p.exporters[0].run()).toEqual(SAMPLE);
  });

  it('undo/redo navigate snapshots and reproject re-derives the value', () => {
    const p = createRigidProfile();
    const { value } = p.import(SAMPLE);
    const edited = clone(value);
    edited[0].children[0].words[1].text = 'DOG'; // rewrite "cat"
    p.versioning.snapshot(edited);
    expect(p.versioning.canUndo()).toBe(true);
    expect(p.reproject()[0].children[0].words[1].text).toBe('DOG');
    p.versioning.undo();
    expect(p.reproject()[0].children[0].words[1].text).toBe('cat');
    expect(p.exporters[0].run()).toEqual(SAMPLE);
  });
});
