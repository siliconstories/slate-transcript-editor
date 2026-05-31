import React, { useState, useEffect } from 'react';
import { action } from 'storybook/actions';
import SlateTranscriptEditor from './index.js';

export default {
  title: 'Live',
  component: SlateTranscriptEditor,
};

const DEMO_MEDIA_URL_SOLEIO =
  'https://digital-paper-edit-demo.s3.eu-west-2.amazonaws.com/PBS-Frontline/The+Facebook+Dilemma+-+interviews/The+Facebook+Dilemma+-+Soleio+Cuervo-OIAUfZBd_7w.mp4';
import DEMO_SOLEIO_LIVE from '../sample-data/segmented-transcript-soleio-dpe.json';

// Parent component to simulate results from a live STT stream.
const Example = (props) => {
  const [jsonData] = useState({});
  const [interimResults, setInterimResults] = useState({});

  // https://travishorn.com/delaying-foreach-iterations-2ebd4b29ad30
  const delayLoop = (fn, delay) => {
    return (x, i) => {
      setTimeout(() => {
        fn(x);
      }, i * delay);
    };
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
      mediaUrl={DEMO_MEDIA_URL_SOLEIO}
      handleSaveEditor={action('handleSaveEditor')}
      handleAutoSaveChanges={action('handleAutoSaveChanges')}
      autoSaveContentType={'digitalpaperedit'}
      transcriptData={jsonData}
      transcriptDataLive={interimResults}
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
      transcriptInParts={DEMO_SOLEIO_LIVE}
      title={'Simulated a live STT interim results via a timer and segmented STT json, NOT editable'}
    />
  ),
};

export const Editable = {
  render: () => (
    <Example
      isEditable={true}
      transcriptInParts={DEMO_SOLEIO_LIVE}
      title={'Simulated a live STT interim results via a timer and segmented STT json, editable'}
    />
  ),
};
