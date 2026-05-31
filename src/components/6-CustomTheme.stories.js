import React from 'react';
import { action } from 'storybook/actions';
import { version } from '../../package.json';

import { createTheme, ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { lightBlue, red, orange, deepOrange } from '@mui/material/colors';

import SlateTranscriptEditor from './index.js';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

export default {
  title: 'Custom Theme',
  component: SlateTranscriptEditor,
};

const DEMO_MEDIA_URL_SOLEIO =
  'https://digital-paper-edit-demo.s3.eu-west-2.amazonaws.com/PBS-Frontline/The+Facebook+Dilemma+-+interviews/The+Facebook+Dilemma+-+Soleio+Cuervo-OIAUfZBd_7w.mp4';
const DEMO_TITLE_SOLEIO = 'Soleio Interview, PBS Frontline';
import DEMO_SOLEIO from '../sample-data/soleio-dpe.json';

export const CustomTheme = {
  render: () => {
    const theme = createTheme({
      palette: {
        primary: { main: lightBlue['500'] },
        secondary: { main: red['500'] },
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
              mediaUrl={DEMO_MEDIA_URL_SOLEIO}
              handleSaveEditor={action('handleSaveEditor')}
              autoSaveContentType={'digitalpaperedit'}
              transcriptData={DEMO_SOLEIO}
            />
          </ThemeProvider>
        </StyledEngineProvider>
      </>
    );
  },
};

export const CustomThemeExampleTwo = {
  render: () => {
    const theme = createTheme({
      palette: {
        primary: { main: deepOrange['900'] },
        secondary: { main: orange['900'] },
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
              mediaUrl={DEMO_MEDIA_URL_SOLEIO}
              handleSaveEditor={action('handleSaveEditor')}
              autoSaveContentType={'digitalpaperedit'}
              transcriptData={DEMO_SOLEIO}
            />
          </ThemeProvider>
        </StyledEngineProvider>
      </>
    );
  },
};
