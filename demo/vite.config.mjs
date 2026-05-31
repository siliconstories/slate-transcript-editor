import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Vite replaces the legacy webpack 4 demo build. Webpack 4's acorn 6 couldn't
// parse the modern syntax (??, ?.) shipped by CodeMirror 6 — and, after the
// modernization, by MUI/React/Slate — which is why the old config needed a
// CodeMirror downlevel rule + NODE_OPTIONS=--openssl-legacy-provider. Vite/esbuild
// parse modern syntax natively, so both hacks are gone.
//
// This repo writes JSX in plain .js files. esbuild's `include` must explicitly
// match them so the `jsx` loader (automatic runtime → no React import needed) is
// applied to both demo/ and src/ sources. node_modules is excluded. The HTML entry
// is standalone.jsx because Vite's build-html scanner parses the entry before the
// transform pipeline and needs the .jsx extension to recognize JSX.
const here = dirname(fileURLToPath(import.meta.url));

// difflib (via stt-align-node) assigns to Function.name (SequenceMatcher.name =
// 'SequenceMatcher'; Differ.name = 'Differ';). That is a silent no-op under
// webpack's non-strict CJS but throws "Cannot assign to read only property 'name'"
// under Vite's strict ESM, crashing the bundle at import. The assignments are
// debug-only labels with no behavioral effect — strip them.
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

export default defineConfig({
  root: here,
  base: './',
  // tailwindcss() only emits CSS where a Tailwind stylesheet is imported (demo/lab.css,
  // loaded solely by lab.html) — the MUI Playground (index.html) stays Tailwind-free.
  plugins: [stripDifflibNameAssign, tailwindcss()],
  // The library uses Node's `path` (extname/basename) in browser code; webpack 4
  // auto-polyfilled it, Vite does not — alias to the browser implementation.
  resolve: { alias: { path: 'path-browserify' } },
  esbuild: { loader: 'jsx', jsx: 'automatic', include: /\.jsx?$/, exclude: /node_modules/ },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' }, jsx: 'automatic' },
  },
  build: {
    outDir: resolve(here, '..', 'demo-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
      },
    },
  },
});
