import { createClassicProfile, classicDescriptor } from './classic-profile';
import convertDpeToSlate from '../util/dpe-to-slate';

const DPE = {
  words: [
    { start: 0, end: 0.2, text: 'the' },
    { start: 0.2, end: 0.4, text: 'cat' },
  ],
  paragraphs: [{ start: 0, end: 0.4, speaker: 'Speaker 1' }],
};

describe('classic profile', () => {
  it('import() reproduces convertDpeToSlate exactly (backwards-compat keystone)', () => {
    const p = createClassicProfile();
    expect(p.import(DPE).value).toEqual(convertDpeToSlate(DPE));
    expect(p.import(DPE).model).toBeNull();
  });

  it('allows every edit and defers export/versioning to the editor defaults', () => {
    const p = createClassicProfile();
    expect(p.editPolicy).toEqual({ allowsStructuralEdits: true, allowsFreeText: true, wordLevelOnly: false });
    expect(p.exporters).toBeNull();
    expect(p.versioning).toBeNull();
  });

  it('descriptor detects everything (it is the fallback)', () => {
    expect(classicDescriptor.id).toBe('classic');
    expect(classicDescriptor.detect({ anything: true })).toBe(true);
  });
});
