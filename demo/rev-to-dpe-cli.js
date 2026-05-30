#!/usr/bin/env node
/**
 * Batch-convert rev.ai transcript JSON files to the DPE shape used by
 * SlateTranscriptEditor.
 *
 *   node demo/rev-to-dpe-cli.js <file|dir> [--out <dir>] [--words 40] [--force]
 *
 * - <file>: writes <name>.dpe.json next to it (or into --out).
 * - <dir>:  converts every *.json in the dir that is a rev.ai transcript.
 * - never overwrites the input; refuses an existing output unless --force.
 *
 * The shared converter lives in src/util/rev-to-dpe (ESM, shipped with the
 * library). We transpile that one file in-memory with the already-installed
 * @babel/core so the CLI needs no extra dependency.
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

function loadConverter() {
  const srcPath = path.resolve(__dirname, '..', 'src', 'util', 'rev-to-dpe', 'index.js');
  const { code } = babel.transformFileSync(srcPath, { babelrc: false, configFile: false, presets: ['@babel/preset-env'] });
  const shim = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', code)(shim, shim.exports, require);
  return shim.exports;
}

function parseArgs(argv) {
  const args = { _: [], out: null, words: undefined, force: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--words') args.words = Number(argv[++i]);
    else if (a === '--force') args.force = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else args._.push(a);
  }
  return args;
}

const USAGE = 'Usage: node demo/rev-to-dpe-cli.js <file|dir> [--out <dir>] [--words 40] [--force]';

function listJsonFiles(target) {
  if (fs.statSync(target).isDirectory()) {
    return fs
      .readdirSync(target)
      .filter((f) => f.toLowerCase().endsWith('.json') && !f.toLowerCase().endsWith('.dpe.json'))
      .map((f) => path.join(target, f));
  }
  return [target];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }
  const { default: convertRevToDpe, isRevTranscript } = loadConverter();

  const inputs = args._.flatMap((t) => {
    if (!fs.existsSync(t)) {
      console.error(`✗ not found: ${t}`);
      return [];
    }
    return listJsonFiles(t);
  });

  let converted = 0;
  let skipped = 0;
  inputs.forEach((file) => {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`✗ ${path.basename(file)}: invalid JSON (${e.message})`);
      skipped++;
      return;
    }
    if (!isRevTranscript(parsed)) {
      console.log(`– ${path.basename(file)}: not a rev.ai transcript, skipped`);
      skipped++;
      return;
    }
    const dpe = convertRevToDpe(parsed, { wordsPerParagraph: args.words });
    const base = path.basename(file).replace(/\.json$/i, '') + '.dpe.json';
    const outDir = args.out || path.dirname(file);
    const outPath = path.join(outDir, base);
    if (fs.existsSync(outPath) && !args.force) {
      console.error(`✗ ${base}: already exists (use --force to overwrite)`);
      skipped++;
      return;
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(dpe, null, 2));
    console.log(`✓ ${path.basename(file)} → ${base} (${dpe.words.length} words, ${dpe.paragraphs.length} paragraphs)`);
    converted++;
  });

  console.log(`\nDone: ${converted} converted, ${skipped} skipped.`);
  process.exit(0);
}

main();
