#!/usr/bin/env node
/**
 * Batch-convert a rev.ai word-level transcript into the sentence-level "shadow"
 * model used by SlateTranscriptEditor's downstream features.
 *
 *   node demo/rev-to-sentences-cli.js <input.json> [output.json] [--watch]
 *
 * - default output: <input>.sentences.json next to the input.
 * - --watch: re-convert whenever the input changes.
 * - non-rev.ai inputs are skipped with a notice.
 *
 * The shared core lives in src/util/rev-to-sentences (ESM, shipped with the
 * library). We transpile that one self-contained file in-memory with the
 * already-installed @babel/core, so the CLI needs no extra dependency — same
 * approach as demo/rev-to-dpe-cli.js.
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

function loadCore() {
  const srcPath = path.resolve(__dirname, '..', 'src', 'util', 'rev-to-sentences', 'index.js');
  const { code } = babel.transformFileSync(srcPath, { babelrc: false, configFile: false, presets: ['@babel/preset-env'] });
  const shim = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(shim, shim.exports, require);
  return shim.exports;
}

function parseArgs(argv) {
  const args = { _: [], watch: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--watch') args.watch = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else args._.push(a);
  }
  return args;
}

const USAGE = 'Usage: node demo/rev-to-sentences-cli.js <input.json> [output.json] [--watch]';

function defaultOutput(input) {
  return input.replace(/\.json$/i, '') + '.sentences.json';
}

function convertOnce(core, input, output) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(input, 'utf8'));
  } catch (e) {
    console.error(`✗ ${path.basename(input)}: invalid JSON (${e.message})`);
    return false;
  }
  if (!core.isRevTranscript(parsed)) {
    console.log(`– ${path.basename(input)}: not a rev.ai transcript, skipped`);
    return false;
  }
  const model = core.default(parsed);
  fs.writeFileSync(output, JSON.stringify(model, null, 2) + '\n');
  console.log(`✓ ${path.basename(input)} → ${path.basename(output)} (${model.sentence_count} sentences, ${model.word_count} words)`);
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  const input = args._[0];
  if (!fs.existsSync(input)) {
    console.error(`✗ not found: ${input}`);
    process.exit(1);
  }
  const output = args._[1] || defaultOutput(input);
  const core = loadCore();

  convertOnce(core, input, output);

  if (args.watch) {
    console.log(`… watching ${path.basename(input)} (Ctrl+C to stop)`);
    fs.watchFile(input, { interval: 300 }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) convertOnce(core, input, output);
    });
  }
}

main();
