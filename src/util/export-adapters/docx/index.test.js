/**
 * Golden baseline for the docx exporter, captured on docx 4.7.1. The Phase-2
 * rewrite to docx 9 will NOT byte-match this snapshot — at that point the snapshot
 * is re-generated AFTER the structural assertions below (which encode the
 * load-bearing layout: Heading1+center title, bold speaker run with a tab before
 * the speaker text, one break per body paragraph) still pass and a real .docx has
 * been visually reviewed. The assertions are the durable equivalence contract; the
 * snapshot catches incidental drift.
 */
import JSZip from 'jszip';
import { Packer } from 'docx';
import { buildDocxDocument } from './index';
import { createWhisperProfile } from '../../../transcript-model/whisper-profile';

// A small WhisperX transcript producing two speaker paragraphs (Alice, Bob), built
// the way the editor builds its value on import — no DPE round-trip.
const W = (word, start, end, speaker) => ({ word, start, end, score: 0.95, speaker });
const seg = (start, end, speaker, words) => ({ start, end, text: words.map((w) => w.word).join(' '), speaker, words });
const SEGMENTS = [
  seg(0, 1.2, 'Alice', [
    W('Hello', 0, 0.2, 'Alice'),
    W('world', 0.2, 0.4, 'Alice'),
    W('this', 0.4, 0.6, 'Alice'),
    W('is', 0.6, 0.8, 'Alice'),
    W('Alice', 0.8, 1.2, 'Alice'),
  ]),
  seg(2.0, 3.0, 'Bob', [W('And', 2.0, 2.2, 'Bob'), W('now', 2.2, 2.4, 'Bob'), W('Bob', 2.4, 2.7, 'Bob'), W('speaks', 2.7, 3.0, 'Bob')]),
];
const WHISPERX = { segments: SEGMENTS, word_segments: SEGMENTS.flatMap((s) => s.words), annotation_metadata: { chunks: [] } };
const slateValue = createWhisperProfile().import(WHISPERX).value;

// docx 9 uses the static Packer API; toBuffer works headlessly (no DOM).
async function documentXml(opts) {
  const doc = buildDocxDocument({ value: slateValue, title: 'My Transcript', ...opts });
  const buffer = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

// Normalize away the volatile/boilerplate parts so the structural snapshot is
// stable and portable to docx 9 (which differs in w:val casing + namespace decls).
function normalize(xml) {
  return xml
    .replace(/ xmlns:[a-z0-9]+="[^"]*"/gi, '')
    .replace(/w:val="true"/g, 'w:val="1"')
    .replace(/w:val="false"/g, 'w:val="0"')
    .replace(/>\s+</g, '><')
    .trim();
}

const MATRIX = [
  ['title+speakers+timecodes', { speakers: true, timecodes: true }],
  ['speakers only', { speakers: true, timecodes: false }],
  ['timecodes only', { speakers: false, timecodes: true }],
  ['inlineTimecodes', { inlineTimecodes: true }],
  ['no title', { hideTitle: true, speakers: true, timecodes: true }],
];

describe('docx exporter (golden, docx 4.7.1 baseline)', () => {
  it.each(MATRIX)('document.xml for %s', async (_label, opts) => {
    const xml = normalize(await documentXml(opts));
    expect(xml).toMatchSnapshot();
  });
});

describe('docx exporter (structural equivalence — durable across docx 9)', () => {
  it('renders a Heading1, centered title when not hidden', async () => {
    const xml = await documentXml({ speakers: true, timecodes: true });
    expect(xml).toMatch(/Heading1/);
    expect(xml).toMatch(/<w:jc w:val="center"/);
    expect(xml).toMatch(/My Transcript/);
  });

  it('omits the title when hideTitle is set', async () => {
    const xml = await documentXml({ hideTitle: true, speakers: true });
    expect(xml).not.toMatch(/Heading1/);
  });

  it('emits the speaker as a bold run with a tab before the speaker text', async () => {
    const xml = normalize(await documentXml({ speakers: true, timecodes: true }));
    // bold run carrying a tab, then the speaker name, all before any body text
    // (regex is tolerant of self-closing vs paired tags so it survives docx 9)
    expect(xml).toMatch(/<w:b\b[\s\S]*?<w:tab\b[\s\S]*?Alice/);
  });

  it('emits exactly one break per body paragraph (2 paragraphs in the fixture)', async () => {
    const xml = await documentXml({ speakers: true, timecodes: true });
    const breaks = (xml.match(/<w:br\b[^>]*>/g) || []).length;
    expect(breaks).toBe(2);
  });

  it('inlineTimecodes uppercases the speaker and inlines the text, no body break', async () => {
    const xml = await documentXml({ inlineTimecodes: true });
    expect(xml).toMatch(/ALICE:/);
    expect(xml).toMatch(/BOB:/);
    expect((xml.match(/<w:br\b[^>]*>/g) || []).length).toBe(0);
  });

  it('renders the paragraph body text in document order', async () => {
    const xml = await documentXml({ speakers: true, timecodes: false });
    const alice = xml.indexOf('Hello world this is Alice');
    const bob = xml.indexOf('And now Bob speaks');
    expect(alice).toBeGreaterThan(-1);
    expect(bob).toBeGreaterThan(alice);
  });
});
