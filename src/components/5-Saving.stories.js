import React from 'react';
import { action } from 'storybook/actions';
import { version } from '../../package.json';

import SlateTranscriptEditor from './index.js';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

const DEMO_MEDIA_URL_SOLEIO =
  'https://digital-paper-edit-demo.s3.eu-west-2.amazonaws.com/PBS-Frontline/The+Facebook+Dilemma+-+interviews/The+Facebook+Dilemma+-+Soleio+Cuervo-OIAUfZBd_7w.mp4';
const DEMO_TITLE_SOLEIO = 'Soleio Interview, PBS Frontline';
import DEMO_SOLEIO from '../sample-data/soleio-dpe.json';

export default {
  title: 'Saving indicator',
  component: SlateTranscriptEditor,
};

export const NoAutoSave = {
  render: () => (
    <>
      <p>
        Slate Transcript Editor version: <code>{version}</code>
      </p>
      <SlateTranscriptEditor
        title={DEMO_TITLE_SOLEIO}
        mediaUrl={DEMO_MEDIA_URL_SOLEIO}
        handleSaveEditor={action('handleSaveEditor')}
        autoSaveContentType={'digitalpaperedit'}
        transcriptData={DEMO_SOLEIO}
      />
    </>
  ),
};

export const AutoSave = {
  render: () => (
    <>
      <p>
        Slate Transcript Editor version: <code>{version}</code>
      </p>
      <SlateTranscriptEditor
        title={DEMO_TITLE_SOLEIO}
        mediaUrl={DEMO_MEDIA_URL_SOLEIO}
        handleSaveEditor={action('handleSaveEditor')}
        handleAutoSaveChanges={action('handleAutoSaveChanges')}
        autoSaveContentType={'digitalpaperedit'}
        transcriptData={DEMO_SOLEIO}
      />
    </>
  ),
};
