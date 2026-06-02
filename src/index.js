import SlateTranscriptEditor from './components/index.js';
import { secondsToTimecode, timecodeToSeconds, shortTimecode } from './util/timecode-converter/index.js';
import slateToText from './util/export-adapters/txt';
import { registerProfile, getProfile, detectProfile, resolveProfile } from './transcript-model/profile';
import { createWhisperProfile, whisperDescriptor } from './transcript-model/whisper-profile';
import buildSentenceModel from './util/rev-to-sentences/index.js';
import splitSentences from './util/rev-to-sentences/split-sentences.js';
import { PreferencesProvider } from './preferences/PreferencesProvider';
import { usePreferences } from './preferences/PreferencesContext';
import { confidenceToStyle } from './util/confidence-scale';
import { DEFAULT_SETTINGS, BUILTIN_PRESETS } from './preferences/defaults';

export default SlateTranscriptEditor;

export {
  SlateTranscriptEditor,
  secondsToTimecode,
  timecodeToSeconds,
  shortTimecode,
  slateToText,
  registerProfile,
  getProfile,
  detectProfile,
  resolveProfile,
  createWhisperProfile,
  whisperDescriptor,
  buildSentenceModel,
  splitSentences,
  PreferencesProvider,
  usePreferences,
  confidenceToStyle,
  DEFAULT_SETTINGS,
  BUILTIN_PRESETS,
};
