/**
 * @jest-environment jsdom
 *
 * First automated "the editor mounts" signal. The 1218-line SlateTranscriptEditor
 * had no test before the modernization; this RTL+jsdom harness asserts it mounts
 * without throwing and renders the imported transcript text. It is the canary every
 * later phase (React 19, Slate 0.124, MUI v9) re-runs to localize a mount-level break.
 *
 * jsdom doesn't implement Selection/Range geometry or HTMLMediaElement playback;
 * slate-react and the <video> element need them, so they're polyfilled below.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
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

describe('SlateTranscriptEditor — mount smoke', () => {
  it('mounts with a DPE transcript and renders the paragraph text', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={DPE} mediaUrl="https://example.com/media.mp4" title="Smoke Test" />);
    // Slate splits a paragraph across leaf/speaker/timecode nodes, so assert on the
    // concatenated text content rather than a single element.
    expect(container.textContent).toContain('Hello world this is Alice');
    expect(container.textContent).toContain('And now Bob speaks');
  });

  it('renders speaker labels and a media element', () => {
    const { container } = render(<SlateTranscriptEditor transcriptData={DPE} mediaUrl="https://example.com/media.mp4" title="Smoke Test" />);
    expect(container.textContent).toMatch(/Alice/);
    expect(container.textContent).toMatch(/Bob/);
    // the media player mounted
    expect(container.querySelector('video, audio')).toBeTruthy();
  });
});
