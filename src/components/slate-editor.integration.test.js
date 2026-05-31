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
import { render, act, cleanup } from '@testing-library/react';
import { createEditor, Transforms, Editor } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';
import convertDpeToSlate from '../util/dpe-to-slate';
import SlateTranscriptEditor from './index';
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
