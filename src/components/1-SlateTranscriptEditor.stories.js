import React from 'react';
import { action } from 'storybook/actions';
import { version } from '../../package.json';

import Button from '@mui/material/Button';
import SlateTranscriptEditor from './index.js';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

const AUDIO_URL = 'https://www.w3schools.com/tags/horse.ogg';
const DEMO_MEDIA_URL_SOLEIO =
  'https://digital-paper-edit-demo.s3.eu-west-2.amazonaws.com/PBS-Frontline/The+Facebook+Dilemma+-+interviews/The+Facebook+Dilemma+-+Soleio+Cuervo-OIAUfZBd_7w.mp4';
const DEMO_TITLE_SOLEIO = 'Soleio Interview, PBS Frontline';
import DEMO_SOLEIO from '../sample-data/soleio-dpe.json';

// CSF3 + args/argTypes replace the SB5 addon-knobs controls; autodocs (preview.js)
// replaces the removed addon-info.
export default {
  title: 'SlateTranscriptEditor',
  component: SlateTranscriptEditor,
  args: {
    mediaUrl: DEMO_MEDIA_URL_SOLEIO,
    transcriptData: DEMO_SOLEIO,
    handleSaveEditor: action('handleSaveEditor'),
    showTitle: false,
    showTimecodes: true,
    showSpeakers: true,
    autoSaveContentType: 'digitalpaperedit',
  },
  argTypes: {
    mediaUrl: { control: 'text' },
    title: { control: 'text' },
    showTitle: { control: 'boolean' },
    showTimecodes: { control: 'boolean' },
    showSpeakers: { control: 'boolean' },
    isEditable: { control: 'boolean' },
    autoSaveContentType: { control: 'select', options: ['digitalpaperedit', 'slate'] },
    transcriptData: { control: false },
  },
};

export const Demo = {
  render: (args) => (
    <>
      <p>
        Slate Transcript Editor version: <code>{version}</code>
      </p>
      <SlateTranscriptEditor {...args} />
    </>
  ),
};

export const MinimalInitialization = {
  args: { mediaUrl: DEMO_MEDIA_URL_SOLEIO, transcriptData: DEMO_SOLEIO },
};

export const OptionalTitle = {
  args: {
    showTitle: true,
    title: DEMO_TITLE_SOLEIO,
    handleAutoSaveChanges: action('handleAutoSaveChanges'),
  },
};

export const NoSpeakers = {
  args: { title: DEMO_TITLE_SOLEIO, showSpeakers: false, handleAutoSaveChanges: action('handleAutoSaveChanges') },
};

export const NoTimecodes = {
  args: { title: DEMO_TITLE_SOLEIO, showTimecodes: false, handleAutoSaveChanges: action('handleAutoSaveChanges') },
};

export const NoSpeakersAndTimecodes = {
  args: { title: DEMO_TITLE_SOLEIO, showTimecodes: false, showSpeakers: false, handleAutoSaveChanges: action('handleAutoSaveChanges') },
};

export const ReadOnly = {
  args: { title: DEMO_TITLE_SOLEIO, isEditable: false, handleAutoSaveChanges: action('handleAutoSaveChanges') },
};

export const Audio = {
  args: { mediaUrl: AUDIO_URL, isEditable: true, handleAutoSaveChanges: action('handleAutoSaveChanges') },
};

export const OptionalAnalytics = {
  render: (args) => (
    <>
      <p>
        Slate Transcript Editor version: <code>{version}</code>
      </p>
      <SlateTranscriptEditor {...args} handleAnalyticsEvents={action('handleAnalyticsEvents')} />
    </>
  ),
};

export const OptionalChildComponents = {
  render: (args) => (
    <>
      <p>
        Slate Transcript Editor version: <code>{version}</code>
      </p>
      <SlateTranscriptEditor
        {...args}
        handleAnalyticsEvents={action('handleAnalyticsEvents')}
        optionalBtns={
          <>
            <Button title="optional button" color="primary" onClick={() => action('optionalBtn1')()}>
              B
            </Button>
            <Button title="optional button" color="primary" onClick={() => action('optionalBtn2')()}>
              O
            </Button>
          </>
        }
      >
        <h1>Optional child component</h1>
      </SlateTranscriptEditor>
    </>
  ),
};
