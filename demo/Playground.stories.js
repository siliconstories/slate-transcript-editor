import React from 'react';
import Playground from './Playground.js';
import 'fontsource-roboto';

export default {
  title: 'Playground',
};

export const UploadYourOwn = () => <Playground />;

UploadYourOwn.story = {
  name: 'Upload your own',
};
