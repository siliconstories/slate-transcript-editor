import { createWhisperProfile } from './whisper-profile';
import { SESSION_FORMAT, isSessionFile } from './session-format';
import { repairStyleRanges } from './repair-style-ranges';
import buildStyleDecorations from '../util/style-decorations';
import selectionToStyleRanges from '../util/selection-to-style-range';
import { alignParagraph } from './align-paragraph';
import { tokenToLeafWord } from './freetext-to-slate';

const txt = (value, ts, end_ts, confidence) => ({ type: 'text', value, ts, end_ts, ...(typeof confidence === 'number' ? { confidence } : {}) });
const sp = { type: 'punct', value: ' ' };
const REV = {
  monologues: [
    { speaker: 0, elements: [txt('the', 0, 0.2, 0.9), sp, txt('cat', 1.0, 1.2, 0.8), sp, txt('sat', 1.2, 1.6, 0.99), { type: 'punct', value: '.' }] },
  ],
};

describe('style-decorations (rendering)', () => {
  const value = [
    {
      type: 'timedText',
      speaker: 'A',
      children: [
        {
          text: 'the cat sat',
          words: [
            { _key: '0:0', text: 'the' },
            { _key: '0:2', text: 'cat' },
            { _key: '0:4', text: 'sat' },
          ],
        },
      ],
    },
  ];

  it('maps a whole-word range to the right char offsets', () => {
    const ranges = [{ id: 's1', fromKey: '0:2', fromOffset: 0, toKey: '0:2', toOffset: 3, mark: 'bold' }];
    const { enabled, byPara } = buildStyleDecorations(value, ranges);
    expect(enabled).toBe(true);
    expect(byPara[0]).toEqual([{ charStart: 4, charEnd: 7, mark: 'bold', id: 's1' }]); // "cat" at 4..7
  });

  it('maps a cross-word range spanning the joining space', () => {
    const ranges = [{ id: 's2', fromKey: '0:0', fromOffset: 0, toKey: '0:2', toOffset: 3, mark: { highlight: '#ff0' } }];
    const { byPara } = buildStyleDecorations(value, ranges);
    expect(byPara[0][0]).toMatchObject({ charStart: 0, charEnd: 7 }); // "the cat"
  });

  it('skips a range whose anchor no longer resolves', () => {
    const ranges = [{ id: 's3', fromKey: 'gone', fromOffset: 0, toKey: 'gone', toOffset: 3, mark: 'bold' }];
    expect(buildStyleDecorations(value, ranges).enabled).toBe(false);
  });
});

describe('selectionToStyleRanges', () => {
  const value = [
    {
      type: 'timedText',
      children: [
        {
          text: 'the cat sat',
          words: [
            { _key: '0:0', text: 'the' },
            { _key: '0:2', text: 'cat' },
            { _key: '0:4', text: 'sat' },
          ],
        },
      ],
    },
  ];
  it('resolves a selection to word-anchored offsets', () => {
    // select "cat" (offsets 4..7)
    const range = { anchor: { path: [0, 0], offset: 4 }, focus: { path: [0, 0], offset: 7 } };
    expect(selectionToStyleRanges(value, range)).toEqual([{ fromKey: '0:2', fromOffset: 0, toKey: '0:2', toOffset: 3 }]);
  });
});

describe('profile styling — persistence, carry-forward, undo, faithful-export drop', () => {
  it('setStyles/getStyles ride the history; carry forward through a word edit; faithful export drops styling', () => {
    const p = createWhisperProfile();
    const { value } = p.import(REV);
    const range = { id: 's1', fromKey: '0:2', fromOffset: 0, toKey: '0:2', toOffset: 3, mark: 'bold' };
    expect(p.versioning.setStyles([range])).toBe(true);
    expect(p.versioning.getStyles()).toEqual([range]);

    // a subsequent word rewrite must NOT drop the style (carried forward + repaired)
    const edited = JSON.parse(JSON.stringify(value));
    edited[0].children[0].words[0].text = 'THE';
    expect(p.versioning.snapshot(edited)).toBe(true);
    expect(p.versioning.getStyles().map((s) => s.id)).toEqual(['s1']);

    // faithful export carries NO styling
    const out = p.exporters.find((e) => e.id === 'json-rev').run();
    expect(JSON.stringify(out)).not.toContain('"mark"');
    expect(out.monologues[0].elements[0].value).toBe('THE');

    // undo the rewrite -> styling history restores to the style-only snapshot
    p.versioning.undo();
    expect(p.versioning.getStyles().map((s) => s.id)).toEqual(['s1']);
  });
});

describe('anchor repair on Loose deletion', () => {
  const freestyleEdit = (profile, value, editedText) => {
    const para = value[0];
    const aligned = alignParagraph(profile.originalWordsBetween(para.anchorKey, para.span.lastWordKey), editedText);
    const words = aligned.map((t) => tokenToLeafWord(t, para.speaker));
    return [{ ...para, children: [{ ...para.children[0], text: words.map((w) => w.text).join(' '), words }] }, ...value.slice(1)];
  };

  it('drops a style whose only word was deleted; keeps a style on a surviving word', () => {
    const p = createWhisperProfile();
    const { value } = p.import(REV);
    // style "cat" (0:2) bold and "sat" (0:4) italic
    p.versioning.setStyles([
      { id: 'cat', fromKey: '0:2', fromOffset: 0, toKey: '0:2', toOffset: 3, mark: 'bold' },
      { id: 'sat', fromKey: '0:4', fromOffset: 0, toKey: '0:4', toOffset: 3, mark: 'italic' },
    ]);
    // Loose edit removes "cat": "the sat."
    const edited = freestyleEdit(p, value, 'the sat.');
    expect(p.versioning.snapshotFreeText(edited)).toBe(true);
    const ids = p.versioning
      .getStyles()
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(['sat']); // "cat" style dropped, "sat" style kept
  });

  it('repairStyleRanges clamps a dead endpoint to the nearest survivor', () => {
    const model = {
      words: [
        { key: 'a', value: 'aa' },
        { key: 'b', value: 'bb' },
        { key: 'c', value: 'cc' },
      ],
    };
    // freetext entry deletes 'b'
    const overlay = {
      'para:a': {
        kind: 'freetext',
        span: { firstWordKey: 'a', lastWordKey: 'c' },
        tokens: [
          { ref: 'a', value: 'aa' },
          { ref: 'c', value: 'cc' },
        ],
      },
    };
    const styles = [{ id: 'r', fromKey: 'a', fromOffset: 0, toKey: 'b', toOffset: 2, mark: 'bold' }];
    const repaired = repairStyleRanges(styles, model, overlay);
    expect(repaired).toEqual([{ id: 'r', fromKey: 'a', fromOffset: 0, toKey: 'a', toOffset: 2, mark: 'bold' }]); // clamped b->a
  });
});

describe('editing-session format round-trip', () => {
  it('saves the full overlay incl. styles and re-imports losslessly', () => {
    const p = createWhisperProfile();
    p.import(REV);
    p.versioning.setStyles([{ id: 's1', fromKey: '0:2', fromOffset: 0, toKey: '0:2', toOffset: 3, mark: 'bold' }]);
    const session = p.exporters.find((e) => e.id === 'ste-session').run();
    expect(isSessionFile(session)).toBe(true);
    expect(session.format).toBe(SESSION_FORMAT);
    expect(session.sourceFormat).toBe('revai');

    // re-import into a fresh profile
    const p2 = createWhisperProfile();
    const { value } = p2.import(session);
    expect(p2.versioning.getStyles()).toEqual([{ id: 's1', fromKey: '0:2', fromOffset: 0, toKey: '0:2', toOffset: 3, mark: 'bold' }]);
    expect(value[0].children[0].words.map((w) => w.text)).toEqual(['the', 'cat', 'sat']);
    // faithful export from the restored session still equals the original transcript
    expect(p2.exporters.find((e) => e.id === 'json-rev').run()).toEqual(REV);
  });
});
