/** @type {import('@storybook/react-vite').Preview} */
const preview = {
  // autodocs replaces the removed SB5 addon-info: every story title gets a Docs page.
  tags: ['autodocs'],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
};

export default preview;
