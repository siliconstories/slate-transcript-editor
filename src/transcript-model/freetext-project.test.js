import { revToModel, projectRev } from './rev-overlay.js';
import { whisperxToModel, projectWhisperx } from './whisperx-overlay.js';

// ---- rev.ai fixtures ----
const txt = (value, ts, end_ts, confidence) => {
  const e = { type: 'text', value, ts, end_ts };
  if (typeof confidence === 'number') e.confidence = confidence;
  return e;
};
const sp = { type: 'punct', value: ' ' };
const pn = (v) => ({ type: 'punct', value: v });

const REV = {
  monologues: [
    { speaker: 0, elements: [txt('the', 0.0, 0.2, 0.9), sp, txt('cat', 0.2, 0.4, 0.8), sp, txt('sat', 0.4, 0.6, 0.99), pn('.')] },
    { speaker: 1, elements: [txt('hi', 1.0, 1.2, 0.7), sp, txt('there', 1.3, 1.5, 0.6)] },
  ],
};
// span for mono0 paragraph: elements 0..5, model words the(0:0) cat(0:2) sat(0:4)
const REV_SPAN = { monoIdx: 0, elemStart: 0, elemEnd: 5, firstWordKey: '0:0', lastWordKey: '0:4' };
const revEntry = (tokens) => ({ 'para:0:0': { kind: 'freetext', tokens, span: REV_SPAN } });
const tok = (ref, value, start, end, confidence, estimated) => ({ ref, value, start, end, confidence, estimated });

describe('projectRev — freestyle insert/delete/rewrite', () => {
  it('inserts a word as a new text element + space, survivors keep timing, untouched monologue byte-identical', () => {
    const { original } = revToModel(REV);
    const overlay = revEntry([
      tok('0:0', 'the', 0.0, 0.2, 0.9, false),
      tok(null, 'big', 0.2, 0.2, null, true),
      tok('0:2', 'cat', 0.2, 0.4, 0.8, false),
      tok('0:4', 'sat.', 0.4, 0.6, 0.99, false),
    ]);
    const out = projectRev(original, overlay);
    expect(out.monologues[0].elements.map((e) => e.value)).toEqual(['the', ' ', 'big', ' ', 'cat', ' ', 'sat', '.']);
    expect(out.monologues[0].elements[2]).toEqual({ type: 'text', value: 'big', confidence: 1.0, ts: 0.2, end_ts: 0.2 });
    // survivors preserved verbatim (timing + confidence)
    expect(out.monologues[0].elements[0]).toEqual(txt('the', 0.0, 0.2, 0.9));
    expect(out.monologues[0].elements[6]).toEqual(txt('sat', 0.4, 0.6, 0.99));
    // untouched monologue unchanged
    expect(out.monologues[1]).toEqual(REV.monologues[1]);
  });

  it('deletes a word (absent token) and closes the spacing', () => {
    const { original } = revToModel(REV);
    const out = projectRev(original, revEntry([tok('0:0', 'the', 0.0, 0.2, 0.9, false), tok('0:4', 'sat.', 0.4, 0.6, 0.99, false)]));
    expect(out.monologues[0].elements.map((e) => e.value)).toEqual(['the', ' ', 'sat', '.']);
  });

  it('recased survivor keeps original timing but bumps confidence to 1.0', () => {
    const { original } = revToModel(REV);
    const out = projectRev(
      original,
      revEntry([tok('0:0', 'The', 0.0, 0.2, 0.9, false), tok('0:2', 'cat', 0.2, 0.4, 0.8, false), tok('0:4', 'sat.', 0.4, 0.6, 0.99, false)])
    );
    expect(out.monologues[0].elements[0]).toEqual({ type: 'text', value: 'The', ts: 0.0, end_ts: 0.2, confidence: 1.0 });
  });

  it('empty overlay is still byte-identical', () => {
    const { original } = revToModel(REV);
    expect(projectRev(original, {})).toEqual(REV);
  });
});

// ---- whisperx fixtures ----
const wxWord = (word, start, end, score, speaker) => ({ word, start, end, score, speaker });
const WX_BASE = {
  segments: [
    {
      start: 0,
      end: 0.6,
      text: 'the cat sat',
      speaker: 'S0',
      words: [wxWord('the', 0, 0.2, 0.9, 'S0'), wxWord('cat', 0.2, 0.4, 0.8, 'S0'), wxWord('sat', 0.4, 0.6, 0.99, 'S0')],
    },
    { start: 1.0, end: 1.4, text: 'hello world', speaker: 'S1', words: [wxWord('hello', 1.0, 1.2, 0.7, 'S1'), wxWord('world', 1.2, 1.4, 0.6, 'S1')] },
  ],
};
const WX = { ...WX_BASE, word_segments: [...WX_BASE.segments[0].words, ...WX_BASE.segments[1].words] };
const wxEntry = (tokens) => ({ 'para:0:0': { kind: 'freetext', tokens, span: { segIdx: 0, firstWordKey: '0:0', lastWordKey: '0:2' } } });

describe('projectWhisperx — freestyle insert', () => {
  it('rebuilds the segment words, rebuilds text, regenerates word_segments; survivors keep timing+speaker', () => {
    const { original } = whisperxToModel(WX);
    const out = projectWhisperx(
      original,
      wxEntry([
        tok('0:0', 'the', 0, 0.2, 0.9, false),
        tok(null, 'big', 0.2, 0.2, null, true),
        tok('0:1', 'cat', 0.2, 0.4, 0.8, false),
        tok('0:2', 'sat', 0.4, 0.6, 0.99, false),
      ])
    );
    expect(out.segments[0].words.map((w) => w.word)).toEqual(['the', 'big', 'cat', 'sat']);
    expect(out.segments[0].text).toBe('the big cat sat');
    expect(out.segments[0].words[1]).toEqual({ word: 'big', start: 0.2, end: 0.2, score: 1.0 });
    expect(out.segments[0].words[0].speaker).toBe('S0'); // survivor keeps speaker + timing
    expect(out.segments[0].words[2]).toEqual(wxWord('cat', 0.2, 0.4, 0.8, 'S0'));
    // untouched segment + regenerated flat list
    expect(out.segments[1]).toEqual(WX.segments[1]);
    expect(out.word_segments.length).toBe(6);
    expect(out.word_segments.map((w) => w.word)).toEqual(['the', 'big', 'cat', 'sat', 'hello', 'world']);
  });

  it('empty overlay is byte-identical', () => {
    const { original } = whisperxToModel(WX);
    expect(projectWhisperx(original, {})).toEqual(WX);
  });
});
