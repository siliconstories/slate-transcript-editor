/**
 * @jest-environment jsdom
 *
 * Slate 0.124 runtime integration test. The Phase-0 unit goldens cover the
 * dpe<->slate DATA round-trip, but NOT the editor RUNTIME that Phase 6 reworked:
 * the `value` -> `initialValue` switch (slate-react 0.95+ no longer reads a
 * controlled value), the key-remount used to reproject programmatically
 * (replaceSlateValue), and edit -> onChange -> re-render. The migration plan
 * flags this as "the only thing that catches the RA1 breaks the unit goldens
 * cannot". jsdom lacks Selection/Range geometry + HTMLMediaElement, polyfilled below.
 */
import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { createEditor, Transforms, Editor } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import convertDpeToSlate from '../util/dpe-to-slate';
import SlateTranscriptEditor, { transcriptHasConfidence } from './index';
import DPE from '../util/export-adapters/__fixtures__/golden-dpe.json';

beforeAll(() => {
  const fakeSelection = () => ({
    rangeCount: 0,
    anchorNode: null,
    focusNode: null,
    isCollapsed: true,
    getRangeAt: () => ({}),
    removeAllRanges: () => {},
    addRange: () => {},
    collapse: () => {},
    extend: () => {},
    setBaseAndExtent: () => {},
    removeRange: () => {},
  });
  window.getSelection = fakeSelection;
  document.getSelection = fakeSelection;
  const rect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 });
  if (typeof Range !== 'undefined') {
    Range.prototype.getBoundingClientRect = rect;
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null });
  }
  Element.prototype.getClientRects = Element.prototype.getClientRects || (() => ({ length: 0, item: () => null }));
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();
  window.HTMLMediaElement.prototype.load = jest.fn();
});

afterEach(cleanup);

const makeEditor = () => withReact(withHistory(createEditor()));

describe('Slate 0.124 runtime — value→initialValue + reproject rework', () => {
  it('renders the initialValue document (slate-react 0.124, no controlled value)', () => {
    const editor = makeEditor();
    const { container } = render(
      <Slate editor={editor} initialValue={convertDpeToSlate(DPE)} onChange={() => {}}>
        <Editable />
      </Slate>
    );
    expect(container.textContent).toContain('Hello world this is Alice');
    expect(container.textContent).toContain('And now Bob speaks');
  });

  it('fires onChange and updates the DOM on a programmatic edit', async () => {
    const editor = makeEditor();
    const onChange = jest.fn();
    const { container } = render(
      <Slate editor={editor} initialValue={convertDpeToSlate(DPE)} onChange={onChange}>
        <Editable />
      </Slate>
    );
    // Slate batches ops and flushes editor.onChange() on a microtask, so the edit
    // must run inside an async act() to let that microtask resolve before asserting.
    await act(async () => {
      Transforms.insertText(editor, ' EDITED', { at: Editor.end(editor, []) });
    });
    expect(onChange).toHaveBeenCalled();
    expect(container.textContent).toContain('EDITED');
    // onChange receives the live editor document, which getSlateContent()/exports read
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe(editor.children);
  });

  it('remounting <Slate> via key re-reads initialValue (the replaceSlateValue reproject mechanism)', () => {
    const editor = makeEditor();
    const trigger = {};
    const Harness = () => {
      const [k, setK] = useState(0);
      const [doc, setDoc] = useState(() => convertDpeToSlate(DPE));
      trigger.reproject = (dpe) => {
        setDoc(convertDpeToSlate(dpe));
        setK((x) => x + 1);
      };
      return (
        <Slate key={k} editor={editor} initialValue={doc} onChange={() => {}}>
          <Editable />
        </Slate>
      );
    };
    const { container } = render(<Harness />);
    expect(container.textContent).toContain('Hello world this is Alice');

    const NEW_DPE = {
      words: [
        { start: 0, end: 1, text: 'Completely' },
        { start: 1, end: 2, text: 'different' },
        { start: 2, end: 3, text: 'projection' },
      ],
      paragraphs: [{ start: 0, end: 3, speaker: 'Zoe' }],
    };
    act(() => {
      trigger.reproject(NEW_DPE);
    });
    expect(container.textContent).toContain('Completely different projection');
    expect(container.textContent).not.toContain('Hello world this is Alice');
  });

  it('preserves words + timecodes through a dpe→slate→edit→slate round-trip', () => {
    const slate = convertDpeToSlate(DPE);
    // edit: rename the first word's text in place (mirrors WordLevelEditor / inline edit)
    const firstWords = slate[0].children[0].words;
    const originalCount = slate.reduce((n, p) => n + p.children[0].words.length, 0);
    firstWords[0] = { ...firstWords[0], text: 'Howdy' };
    // the per-word start/end timecodes survive the edit (only text changed)
    expect(slate[0].children[0].words[0].text).toBe('Howdy');
    expect(slate[0].children[0].words[0].start).toBe(DPE.words[0].start);
    expect(slate[0].children[0].words[0].end).toBe(DPE.words[0].end);
    // word count per paragraph is unchanged → slate→dpe save round-trip stays aligned
    const afterCount = slate.reduce((n, p) => n + p.children[0].words.length, 0);
    expect(afterCount).toBe(originalCount);
  });
});

describe('SlateTranscriptEditor — full editor on Slate 0.124', () => {
  it('mounts the classic editor with a contenteditable Slate surface and the transcript', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={DPE} mediaUrl="https://example.com/m.mp4" title="T" />);
    expect(container.textContent).toContain('Hello world this is Alice');
    const editable = container.querySelector('[contenteditable="true"], [role="textbox"]');
    expect(editable).toBeTruthy();
  });
});

const WHISPERX_DOC = {
  segments: [
    {
      start: 1.0,
      end: 1.6,
      text: 'Ich wollte werden,',
      speaker: 'SPEAKER_00',
      words: [
        { word: 'Ich', start: 1.0, end: 1.2, score: 0.9, speaker: 'SPEAKER_00' },
        { word: 'wollte', start: 1.2, end: 1.4, score: 0.8, speaker: 'SPEAKER_00' },
        { word: 'werden,', start: 1.4, end: 1.6, score: 0.95, speaker: 'SPEAKER_00' },
      ],
      annotations: { chunk_topic_label: 'Career path', mood_segment: { primary_de: 'Vertrauen' }, sentiment_segment: { label: 'neutral' } },
    },
    {
      start: 2.0,
      end: 2.4,
      text: 'Ich auch.',
      speaker: 'SPEAKER_01',
      words: [
        { word: 'Ich', start: 2.0, end: 2.2, score: 0.7, speaker: 'SPEAKER_01' },
        { word: 'auch.', start: 2.2, end: 2.4, score: 0.6, speaker: 'SPEAKER_01' },
      ],
    },
  ],
  word_segments: [
    { word: 'Ich', start: 1.0, end: 1.2, score: 0.9, speaker: 'SPEAKER_00' },
    { word: 'wollte', start: 1.2, end: 1.4, score: 0.8, speaker: 'SPEAKER_00' },
    { word: 'werden,', start: 1.4, end: 1.6, score: 0.95, speaker: 'SPEAKER_00' },
    { word: 'Ich', start: 2.0, end: 2.2, score: 0.7, speaker: 'SPEAKER_01' },
    { word: 'auch.', start: 2.2, end: 2.4, score: 0.6, speaker: 'SPEAKER_01' },
  ],
  annotation_metadata: { chunks: [] },
};

describe('SlateTranscriptEditor — WhisperX profile', () => {
  it('mounts the whisperx tier, renders one paragraph per segment with verbatim speakers', () => {
    const { container } = render(
      <SlateTranscriptEditor transcriptData={WHISPERX_DOC} profile="whisperx" mediaUrl="https://example.com/m.mp4" title="T" />
    );
    expect(container.textContent).toContain('Ich wollte werden,');
    expect(container.textContent).toContain('Ich auch.');
    expect(container.textContent).toContain('SPEAKER_00');
    expect(container.textContent).toContain('SPEAKER_01');
    // word-level-only tier renders the WordLevelEditor surface (clickable word spans),
    // not a contenteditable Slate <Editable>
    expect(container.querySelector('.stw-word-level')).toBeTruthy();
    expect(container.querySelector('.stw-word')).toBeTruthy();
  });

  it('hides annotation chips by default and shows them when the preference is enabled', () => {
    const { container: hidden } = render(
      <SlateTranscriptEditor transcriptData={WHISPERX_DOC} profile="whisperx" mediaUrl="https://example.com/m.mp4" />
    );
    expect(hidden.textContent).not.toContain('Career path');

    const { container: shown } = render(
      <SlateTranscriptEditor
        transcriptData={WHISPERX_DOC}
        profile="whisperx"
        mediaUrl="https://example.com/m.mp4"
        defaultPreferences={{ display: { showAnnotations: true } }}
      />
    );
    expect(shown.textContent).toContain('Career path');
    expect(shown.textContent).toContain('sentiment: neutral');
  });

  it('exposes an Annotations toolbar toggle: enabled + functional for whisperx, disabled otherwise', () => {
    const { container: wx } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} profile="whisperx" mediaUrl="https://example.com/m.mp4" />);
    const wxBtn = [...wx.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Annotations');
    expect(wxBtn).toBeTruthy();
    expect(wxBtn.disabled).toBe(false);
    // clicking the toolbar toggle reveals the chips
    expect(wx.textContent).not.toContain('Career path');
    act(() => {
      fireEvent.click(wxBtn);
    });
    expect(wx.textContent).toContain('Career path');

    // classic (DPE) transcripts have no annotations → the toggle is present but disabled
    const { container: dpe } = render(<SlateTranscriptEditor transcriptData={DPE} mediaUrl="https://example.com/m.mp4" />);
    const dpeBtn = [...dpe.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Annotations');
    expect(dpeBtn).toBeTruthy();
    expect(dpeBtn.disabled).toBe(true);
  });

  it('transcriptHasConfidence detects WhisperX score (so the overlay defaults on)', () => {
    expect(transcriptHasConfidence(WHISPERX_DOC)).toBe(true);
    expect(transcriptHasConfidence({ segments: [], word_segments: [] })).toBe(false);
  });

  it('uses the lowered cutoff dropdown options for whisperx, the high ones otherwise', () => {
    const { container: wx } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} profile="whisperx" mediaUrl="https://example.com/m.mp4" />);
    const wxVals = [...wx.querySelector('select[title="Confidence threshold"]').querySelectorAll('option')].map((o) => o.value);
    expect(wxVals).toContain('0.3');
    expect(wxVals).not.toContain('0.85');

    const { container: dpe } = render(<SlateTranscriptEditor transcriptData={DPE} mediaUrl="https://example.com/m.mp4" />);
    const dpeVals = [...dpe.querySelector('select[title="Confidence threshold"]').querySelectorAll('option')].map((o) => o.value);
    expect(dpeVals).toContain('0.85');
  });

  it('orders the Annotations toggle before Confidence in the toolbar', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} profile="whisperx" mediaUrl="https://example.com/m.mp4" />);
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent.trim());
    expect(labels.indexOf('Annotations')).toBeGreaterThan(-1);
    expect(labels.indexOf('Annotations')).toBeLessThan(labels.indexOf('Confidence'));
  });
});

describe('SlateTranscriptEditor — Word|Freestyle editing modes (strict tiers)', () => {
  it('shows the Word|Freestyle switch for whisperx and switches Word → Freestyle (grid → Slate surface)', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} profile="whisperx" mediaUrl="https://example.com/m.mp4" />);
    const freestyleBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Freestyle');
    expect(freestyleBtn).toBeTruthy();
    // default mode = Word → the per-word grid (no contenteditable Slate surface)
    expect(container.querySelector('.stw-word-level')).toBeTruthy();
    expect(container.querySelector('[contenteditable="true"]')).toBeFalsy();

    act(() => {
      fireEvent.click(freestyleBtn);
    });
    // Freestyle → contenteditable Slate surface, grid gone, text preserved
    expect(container.querySelector('[contenteditable="true"], [role="textbox"]')).toBeTruthy();
    expect(container.querySelector('.stw-word-level')).toBeFalsy();
    expect(container.textContent).toContain('Ich wollte werden,');
  });

  it('does not show the editing-mode switch for the classic (DPE) tier', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={DPE} mediaUrl="https://example.com/m.mp4" />);
    const freestyleBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Freestyle');
    expect(freestyleBtn).toBeFalsy();
  });

  it('honors the editingMode="freestyle" prop on mount for a strict tier', () => {
    const { container } = render(
      <SlateTranscriptEditor transcriptData={WHISPERX_DOC} profile="whisperx" editingMode="freestyle" mediaUrl="https://example.com/m.mp4" />
    );
    expect(container.querySelector('[contenteditable="true"], [role="textbox"]')).toBeTruthy();
    expect(container.querySelector('.stw-word-level')).toBeFalsy();
  });
});
