import { mergeConfig } from 'vite';

// difflib (via stt-align-node) assigns to Function.name (SequenceMatcher.name =
// 'SequenceMatcher'; Differ.name = 'Differ';) — a silent no-op under webpack's CJS
// but throws under Vite's strict ESM. Debug-only labels; strip them. (Same plugin
// as demo/vite.config.mjs — see "Hard-won gotchas" in the modernization plan.)
const stripDifflibNameAssign = {
  name: 'strip-difflib-name-assign',
  enforce: 'pre',
  transform(code, id) {
    if (id.includes('difflib') && /\b(SequenceMatcher|Differ)\.name\s*=/.test(code)) {
      return {
        code: code.replace(/\b(SequenceMatcher|Differ)\.name\s*=\s*'[^']*';/g, '/* name assignment removed (read-only in strict mode) */'),
        map: null,
      };
    }
  },
};

/** @type {import('@storybook/react-vite').StorybookConfig} */
export default {
  framework: { name: '@storybook/react-vite', options: {} },
  stories: ['../src/components/**/*.stories.js', '../demo/**/*.stories.js'],
  addons: ['@storybook/addon-links', '@storybook/addon-docs', '@storybook/addon-a11y'],
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [stripDifflibNameAssign],
      // The library uses Node's `path` (extname/basename) in browser code; Vite does
      // not auto-polyfill it — alias to the browser implementation (gotcha #2).
      resolve: { alias: { path: 'path-browserify' } },
      // This repo writes JSX in plain .js files; force the jsx loader on .js/.jsx so
      // both src/ and demo/ stories transform (automatic runtime → no React import).
      esbuild: { loader: 'jsx', jsx: 'automatic', include: /\.jsx?$/, exclude: /node_modules/ },
      optimizeDeps: {
        esbuildOptions: { loader: { '.js': 'jsx' }, jsx: 'automatic' },
      },
    });
  },
};
