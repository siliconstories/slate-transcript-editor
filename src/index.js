import SlateTranscriptEditor from './components/index.js';
import { secondsToTimecode, timecodeToSeconds, shortTimecode } from './util/timecode-converter/index.js';
import convertDpeToSlate from './util/dpe-to-slate/index.js';
import converSlateToDpe from './util/export-adapters/slate-to-dpe/index.js';
import slateToText from './util/export-adapters/txt';
import { registerProfile, getProfile, detectProfile, resolveProfile } from './transcript-model/profile';
import { createRigidProfile } from './transcript-model/rigid-profile';
import { createClassicProfile } from './transcript-model/classic-profile';
import buildSentenceModel from './util/rev-to-sentences/index.js';
import splitSentences from './util/rev-to-sentences/split-sentences.js';

export default SlateTranscriptEditor;

export {
  SlateTranscriptEditor,
  secondsToTimecode,
  timecodeToSeconds,
  shortTimecode,
  convertDpeToSlate,
  converSlateToDpe,
  slateToText,
  registerProfile,
  getProfile,
  detectProfile,
  resolveProfile,
  createRigidProfile,
  createClassicProfile,
  buildSentenceModel,
  splitSentences,
};
