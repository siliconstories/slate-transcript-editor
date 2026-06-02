/**
 * @jest-environment jsdom
 *
 * Slate 0.124 runtime integration test for the unified `whisper` tier. Covers the
 * editor RUNTIME (value -> initialValue, key-remount reproject, edit -> onChange ->
 * re-render) plus the WhisperX/rev.ai profile wiring (import, annotations toggle,
 * confidence defaults, Rigid|Loose modes). jsdom lacks Selection/Range geometry +
 * HTMLMediaElement, polyfilled below.
 */
import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { createEditor, Transforms, Editor } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import { createWhisperProfile } from '../transcript-model/whisper-profile';
import SlateTranscriptEditor, { transcriptHasConfidence } from './index';

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
// Project a transcript to a Slate value the way the editor does on import.
const toSlate = (doc) => createWhisperProfile().import(doc).value;

// The Show toggles + confidence sub-controls live in an anchored "Display" popover.
const openDisplay = (container) => {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Display');
  act(() => {
    fireEvent.click(btn);
  });
};

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

// rev.ai-shaped transcript: no segment annotations, normal ASR confidence scale.
const REV_DOC = {
  monologues: [
    {
      speaker: 0,
      elements: [
        { type: 'text', value: 'Hello', ts: 0, end_ts: 0.2, confidence: 0.97 },
        { type: 'punct', value: ' ' },
        { type: 'text', value: 'there', ts: 0.2, end_ts: 0.4, confidence: 0.9 },
        { type: 'punct', value: '.' },
      ],
    },
  ],
};

describe('Slate 0.124 runtime — value→initialValue + reproject rework', () => {
  it('renders the initialValue document (slate-react 0.124, no controlled value)', () => {
    const editor = makeEditor();
    const { container } = render(
      <Slate editor={editor} initialValue={toSlate(WHISPERX_DOC)} onChange={() => {}}>
        <Editable />
      </Slate>
    );
    expect(container.textContent).toContain('Ich wollte werden,');
    expect(container.textContent).toContain('Ich auch.');
  });

  it('fires onChange and updates the DOM on a programmatic edit', async () => {
    const editor = makeEditor();
    const onChange = jest.fn();
    const { container } = render(
      <Slate editor={editor} initialValue={toSlate(WHISPERX_DOC)} onChange={onChange}>
        <Editable />
      </Slate>
    );
    await act(async () => {
      Transforms.insertText(editor, ' EDITED', { at: Editor.end(editor, []) });
    });
    expect(onChange).toHaveBeenCalled();
    expect(container.textContent).toContain('EDITED');
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0]).toBe(editor.children);
  });

  it('remounting <Slate> via key re-reads initialValue (the replaceSlateValue reproject mechanism)', () => {
    const editor = makeEditor();
    const trigger = {};
    const Harness = () => {
      const [k, setK] = useState(0);
      const [doc, setDoc] = useState(() => toSlate(WHISPERX_DOC));
      trigger.reproject = (wx) => {
        setDoc(toSlate(wx));
        setK((x) => x + 1);
      };
      return (
        <Slate key={k} editor={editor} initialValue={doc} onChange={() => {}}>
          <Editable />
        </Slate>
      );
    };
    const { container } = render(<Harness />);
    expect(container.textContent).toContain('Ich wollte werden,');

    const NEW_DOC = {
      segments: [
        {
          start: 0,
          end: 3,
          text: 'Completely different projection',
          speaker: 'Zoe',
          words: [
            { word: 'Completely', start: 0, end: 1, score: 0.9, speaker: 'Zoe' },
            { word: 'different', start: 1, end: 2, score: 0.9, speaker: 'Zoe' },
            { word: 'projection', start: 2, end: 3, score: 0.9, speaker: 'Zoe' },
          ],
        },
      ],
      word_segments: [
        { word: 'Completely', start: 0, end: 1, score: 0.9, speaker: 'Zoe' },
        { word: 'different', start: 1, end: 2, score: 0.9, speaker: 'Zoe' },
        { word: 'projection', start: 2, end: 3, score: 0.9, speaker: 'Zoe' },
      ],
    };
    act(() => {
      trigger.reproject(NEW_DOC);
    });
    expect(container.textContent).toContain('Completely different projection');
    expect(container.textContent).not.toContain('Ich wollte werden,');
  });

  it('preserves words + timecodes through a project→edit round-trip', () => {
    const slate = toSlate(WHISPERX_DOC);
    const firstWords = slate[0].children[0].words;
    const originalCount = slate.reduce((n, p) => n + p.children[0].words.length, 0);
    firstWords[0] = { ...firstWords[0], text: 'Howdy' };
    expect(slate[0].children[0].words[0].text).toBe('Howdy');
    expect(slate[0].children[0].words[0].start).toBe(WHISPERX_DOC.segments[0].words[0].start);
    expect(slate[0].children[0].words[0].end).toBe(WHISPERX_DOC.segments[0].words[0].end);
    const afterCount = slate.reduce((n, p) => n + p.children[0].words.length, 0);
    expect(afterCount).toBe(originalCount);
  });
});

describe('SlateTranscriptEditor — full editor on Slate 0.124', () => {
  it('mounts the editor with the transcript text on a single Slate surface', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} mediaUrl="https://example.com/m.mp4" title="T" />);
    expect(container.textContent).toContain('Ich wollte werden,');
    // both modes render ONE Slate surface (no separate word grid)
    expect(container.querySelector('[data-slate-editor]')).toBeTruthy();
    expect(container.querySelector('.stw-word-level')).toBeFalsy();
  });
});

describe('SlateTranscriptEditor — WhisperX format', () => {
  it('mounts the whisperx tier, renders one paragraph per segment with verbatim speakers', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} mediaUrl="https://example.com/m.mp4" title="T" />);
    expect(container.textContent).toContain('Ich wollte werden,');
    expect(container.textContent).toContain('Ich auch.');
    expect(container.textContent).toContain('SPEAKER_00');
    expect(container.textContent).toContain('SPEAKER_01');
    expect(container.querySelector('[data-slate-editor]')).toBeTruthy();
  });

  it('hides annotation chips by default and shows them when the preference is enabled', () => {
    const { container: hidden } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} mediaUrl="https://example.com/m.mp4" />);
    expect(hidden.textContent).not.toContain('Career path');

    const { container: shown } = render(
      <SlateTranscriptEditor
        transcriptData={WHISPERX_DOC}
        mediaUrl="https://example.com/m.mp4"
        defaultPreferences={{ display: { showAnnotations: true } }}
      />
    );
    expect(shown.textContent).toContain('Career path');
    expect(shown.textContent).toContain('sentiment: neutral');
  });

  it('exposes an Annotations toggle: enabled for whisperx, disabled for rev.ai (no annotations)', () => {
    const { container: wx } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} mediaUrl="https://example.com/m.mp4" />);
    openDisplay(wx);
    const wxBtn = [...wx.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Annotations');
    expect(wxBtn).toBeTruthy();
    expect(wxBtn.disabled).toBe(false);
    expect(wx.textContent).not.toContain('Career path');
    act(() => {
      fireEvent.click(wxBtn);
    });
    expect(wx.textContent).toContain('Career path');

    // rev.ai transcripts have no annotations → the toggle is present but disabled
    const { container: rev } = render(<SlateTranscriptEditor transcriptData={REV_DOC} mediaUrl="https://example.com/m.mp4" />);
    openDisplay(rev);
    const revBtn = [...rev.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Annotations');
    expect(revBtn).toBeTruthy();
    expect(revBtn.disabled).toBe(true);
  });

  it('transcriptHasConfidence detects WhisperX score (so the overlay defaults on)', () => {
    expect(transcriptHasConfidence(WHISPERX_DOC)).toBe(true);
    expect(transcriptHasConfidence({ segments: [], word_segments: [] })).toBe(false);
  });

  it('uses the lowered cutoff dropdown options for whisperx, the high ones for rev.ai', () => {
    const { container: wx } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} mediaUrl="https://example.com/m.mp4" />);
    openDisplay(wx);
    const wxVals = [...wx.querySelector('select[title="Confidence threshold"]').querySelectorAll('option')].map((o) => o.value);
    expect(wxVals).toContain('0.3');
    expect(wxVals).not.toContain('0.85');

    const { container: rev } = render(<SlateTranscriptEditor transcriptData={REV_DOC} mediaUrl="https://example.com/m.mp4" />);
    openDisplay(rev);
    const revVals = [...rev.querySelector('select[title="Confidence threshold"]').querySelectorAll('option')].map((o) => o.value);
    expect(revVals).toContain('0.85');
  });

  it('orders Annotations before Confidence inside the Display popover', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} mediaUrl="https://example.com/m.mp4" />);
    openDisplay(container);
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent.trim());
    expect(labels.indexOf('Annotations')).toBeGreaterThan(-1);
    expect(labels.indexOf('Annotations')).toBeLessThan(labels.indexOf('Confidence'));
  });
});

describe('SlateTranscriptEditor — Strict|Loose editing modes (one shared surface)', () => {
  it('shows the Mode: Strict|Loose switch; both modes are the SAME Slate surface, differing in read-only', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={WHISPERX_DOC} mediaUrl="https://example.com/m.mp4" />);
    const strictBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Strict');
    const looseBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Loose');
    expect(strictBtn).toBeTruthy();
    expect(looseBtn).toBeTruthy();
    // default mode = Strict (word) → the SAME Slate surface, but read-only (not editable)
    expect(container.querySelector('[data-slate-editor]')).toBeTruthy();
    expect(container.querySelector('[contenteditable="true"]')).toBeFalsy();
    expect(container.querySelector('.stw-word-level')).toBeFalsy(); // no separate grid

    act(() => {
      fireEvent.click(looseBtn);
    });
    // Loose (freestyle) → the same surface becomes contenteditable, text preserved
    expect(container.querySelector('[contenteditable="true"], [role="textbox"]')).toBeTruthy();
    expect(container.textContent).toContain('Ich wollte werden,');
  });

  it('honors the editingMode="freestyle" prop on mount (editable Slate surface)', () => {
    const { container } = render(
      <SlateTranscriptEditor transcriptData={WHISPERX_DOC} editingMode="freestyle" mediaUrl="https://example.com/m.mp4" />
    );
    expect(container.querySelector('[contenteditable="true"], [role="textbox"]')).toBeTruthy();
  });
});
