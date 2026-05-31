import React from 'react';
import Playground from './Playground.js';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

export default {
  title: 'Playground',
};

export const UploadYourOwn = () => <Playground />;

UploadYourOwn.story = {
  name: 'Upload your own',
};
