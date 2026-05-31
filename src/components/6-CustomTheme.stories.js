import React from 'react';
import { action } from '@storybook/addon-actions';
import { withKnobs, text, boolean, number, object, select } from '@storybook/addon-knobs';
import { withInfo } from '@storybook/addon-info';
import { version } from '../../package.json';

import { createTheme, ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { lightBlue, red, orange, deepOrange } from '@mui/material/colors';
// import purple from '@mui/material/colors/purple';

import SlateTranscriptEditor from './index.js';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

export default {
  title: 'Custom Theme',
  component: SlateTranscriptEditor,
  decorators: [withKnobs, withInfo],
  parameters: {
    info: {
      maxPropArrayLength: 3,
      maxPropsIntoLine: 3,
      maxPropObjectKeys: 1,
      excludedPropTypes: ['transcriptData'],
      source: false,
    },
  },
};

const DEMO_MEDIA_URL_SOLEIO =
  'https://digital-paper-edit-demo.s3.eu-west-2.amazonaws.com/PBS-Frontline/The+Facebook+Dilemma+-+interviews/The+Facebook+Dilemma+-+Soleio+Cuervo-OIAUfZBd_7w.mp4';
const DEMO_TITLE_SOLEIO = 'Soleio Interview, PBS Frontline';
import DEMO_SOLEIO from '../sample-data/soleio-dpe.json';

export const CustomTheme = () => {
  const theme = createTheme({
    palette: {
      background: {
        // paper: '#424242',
        // default: '#303030',
      },
      primary: {
        main: lightBlue['500'],
      },
      secondary: {
        main: red['500'],
      },
    },
  });
  return (
    <>
      <p>
        Slate Transcript Editor version: <code>{version}</code>
      </p>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
          <SlateTranscriptEditor
            title={DEMO_TITLE_SOLEIO}
            mediaUrl={text('mediaUrl', DEMO_MEDIA_URL_SOLEIO)}
            handleSaveEditor={action('handleSaveEditor')}
            // handleAutoSaveChanges={action('handleAutoSaveChanges')}
            // https://www.npmjs.com/package/@storybook/addon-knobs#select
            autoSaveContentType={select('autoSaveContentType', ['digitalpaperedit', 'slate'], 'digitalpaperedit')} // digitalpaperedit or slate - digitalpaperedit, runs alignement before exporting, slate, is just the raw data.
            // transcriptData={object('transcriptData', DEMO_SOLEIO)}
            transcriptData={DEMO_SOLEIO}
          />
        </ThemeProvider>
      </StyledEngineProvider>
    </>
  );
};

export const CustomThemeExampleTwo = () => {
  const theme = createTheme({
    palette: {
      background: {
        // paper: '#424242',
        // default: '#303030',
      },
      primary: {
        main: deepOrange['900'],
      },
      secondary: {
        main: orange['900'],
      },
    },
  });
  return (
    <>
      <p>
        Slate Transcript Editor version: <code>{version}</code>
      </p>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
          <SlateTranscriptEditor
            title={DEMO_TITLE_SOLEIO}
            mediaUrl={text('mediaUrl', DEMO_MEDIA_URL_SOLEIO)}
            handleSaveEditor={action('handleSaveEditor')}
            // handleAutoSaveChanges={action('handleAutoSaveChanges')}
            // https://www.npmjs.com/package/@storybook/addon-knobs#select
            autoSaveContentType={select('autoSaveContentType', ['digitalpaperedit', 'slate'], 'digitalpaperedit')} // digitalpaperedit or slate - digitalpaperedit, runs alignement before exporting, slate, is just the raw data.
            // transcriptData={object('transcriptData', DEMO_SOLEIO)}
            transcriptData={DEMO_SOLEIO}
          />
        </ThemeProvider>
      </StyledEngineProvider>
    </>
  );
};
