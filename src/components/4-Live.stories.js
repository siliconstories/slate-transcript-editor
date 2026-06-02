import React, { useState, useEffect } from 'react';
import { action } from 'storybook/actions';
import SlateTranscriptEditor from './index.js';
import GEMS_UZH from '../sample-data/GEMS-01-UZH.json';

export default {
  title: 'Live',
  component: SlateTranscriptEditor,
};

const GEMS_MEDIA_URL = '/strict-media/GEMS-01.mp4';

// Build a valid WhisperX chunk ({ segments, word_segments }) from a slice of segments.
const chunk = (segments) => ({ segments, word_segments: segments.flatMap((s) => s.words || []) });

// Simulate a live stream by splitting the WhisperX transcript into an initial block
// plus a few interim parts that arrive on a timer. Each part is a self-contained
// WhisperX doc the editor projects to Slate nodes and appends (display-only).
const SEGMENTS = GEMS_UZH.segments.slice(0, 9);
const INITIAL = chunk(SEGMENTS.slice(0, 3));
const LIVE_PARTS = [chunk(SEGMENTS.slice(3, 6)), chunk(SEGMENTS.slice(6, 9))];

// Parent component to simulate results from a live STT stream.
const Example = (props) => {
  const [interimResults, setInterimResults] = useState({});

  const delayLoop = (fn, delay) => (x, i) => {
    setTimeout(() => fn(x), i * delay);
  };

  useEffect(() => {
    props.transcriptInParts &&
      props.transcriptInParts.forEach(
        delayLoop((transcriptPart) => {
          setInterimResults(transcriptPart);
        }, 3000)
      );
  }, []);

  return (
    <SlateTranscriptEditor
      mediaUrl={GEMS_MEDIA_URL}
      handleSaveEditor={action('handleSaveEditor')}
      handleAutoSaveChanges={action('handleAutoSaveChanges')}
      autoSaveContentType={'whisperx'}
      transcriptData={INITIAL}
      transcriptDataLive={interimResults}
      editingMode={'freestyle'}
      isEditable={props.isEditable}
      title={props.title}
      showTitle={true}
      showTimecodes={true}
      showSpeakers={true}
    />
  );
};

export const NotEditable = {
  render: () => (
    <Example
      isEditable={false}
      transcriptInParts={LIVE_PARTS}
      title={'Simulated live STT interim results via a timer + segmented WhisperX JSON, NOT editable'}
    />
  ),
};

export const Editable = {
  render: () => (
    <Example
      isEditable={true}
      transcriptInParts={LIVE_PARTS}
      title={'Simulated live STT interim results via a timer + segmented WhisperX JSON, editable'}
    />
  ),
};
