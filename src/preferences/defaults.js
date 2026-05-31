/**
 * Preferences data model: default settings, built-in presets, and the pure
 * helpers the provider uses. No React, no storage here.
 *
 * `settings` is the single live object the editor renders from. A PRESET bundles
 * only the visual groups (display + appearance + confidence); playback + editing
 * are global and never serialized into a preset.
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'slate-transcript-editor:preferences:v1';

// Groups a preset captures (everything else is global).
export const PRESET_GROUPS = ['display', 'appearance', 'confidence'];

export const DEFAULT_SETTINGS = {
  display: { showSpeakers: true, showTimecodes: true, showTitle: false },
  appearance: { fontSize: 15, lineSpacing: 1.5, highlightOpacity: 0.5 },
  confidence: { overlay: true, level: 'word', cutoff: 0.85, floor: 0.55, sentenceMetric: 'mean' },
  playback: { followPlayback: true, playbackSpeed: 1, seekStepSeconds: 10 },
  editing: { wordLevelEditing: false, autoSaveContentType: 'digitalpaperedit', pauseWhileTyping: false },
};

const cloneSettings = (s) => {
  const out = {};
  Object.keys(s).forEach((k) => {
    out[k] = { ...s[k] };
  });
  return out;
};

/** Shallow-merge each setting group of `partial` over `base`; always returns a fresh tree. */
export const mergeSettings = (base, partial) => {
  const out = cloneSettings(base);
  if (partial) {
    Object.keys(partial).forEach((group) => {
      out[group] = { ...(out[group] || {}), ...(partial[group] || {}) };
    });
  }
  return out;
};

export const bundleFromSettings = (settings) =>
  PRESET_GROUPS.reduce((acc, k) => {
    acc[k] = { ...settings[k] };
    return acc;
  }, {});

/** Apply a preset bundle onto the preset-scoped groups, leaving global groups untouched. */
export const applyBundleToSettings = (settings, bundle) => {
  const out = cloneSettings(settings);
  PRESET_GROUPS.forEach((k) => {
    if (bundle && bundle[k]) out[k] = { ...settings[k], ...bundle[k] };
  });
  return out;
};

const shallowEqual = (a = {}, b = {}) => {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
};

export const settingsMatchBundle = (settings, bundle) => PRESET_GROUPS.every((k) => shallowEqual(settings[k], bundle && bundle[k]));

/** Map the legacy individual props to settings — first-init seeding only. */
export const seedSettingsFromProps = (props = {}) => {
  const s = cloneSettings(DEFAULT_SETTINGS);
  if (typeof props.showSpeakers === 'boolean') s.display.showSpeakers = props.showSpeakers;
  if (typeof props.showTimecodes === 'boolean') s.display.showTimecodes = props.showTimecodes;
  if (typeof props.showTitle === 'boolean') s.display.showTitle = props.showTitle;
  if (typeof props.followPlayback === 'boolean') s.playback.followPlayback = props.followPlayback;
  if (typeof props.wordLevelEditing === 'boolean') s.editing.wordLevelEditing = props.wordLevelEditing;
  if (typeof props.autoSaveContentType === 'string') s.editing.autoSaveContentType = props.autoSaveContentType;
  return s;
};

/** Fresh defaults with the overlay defaulting to whether confidence data exists. */
export const freshDefaultSettings = (hasConfidence = false) => {
  const s = cloneSettings(DEFAULT_SETTINGS);
  s.confidence = { ...s.confidence, overlay: Boolean(hasConfidence) };
  return s;
};

export const BUILTIN_PRESETS = [
  { id: 'default', name: 'Default', builtIn: true, bundle: bundleFromSettings(DEFAULT_SETTINGS) },
  {
    id: 'proofreading',
    name: 'Proofreading',
    builtIn: true,
    bundle: {
      display: { showSpeakers: true, showTimecodes: true, showTitle: false },
      appearance: { fontSize: 15, lineSpacing: 1.5, highlightOpacity: 0.55 },
      confidence: { overlay: true, level: 'word', cutoff: 0.85, floor: 0.55, sentenceMetric: 'mean' },
    },
  },
  {
    id: 'clean-reading',
    name: 'Clean reading',
    builtIn: true,
    bundle: {
      display: { showSpeakers: true, showTimecodes: false, showTitle: false },
      appearance: { fontSize: 18, lineSpacing: 1.7, highlightOpacity: 0.5 },
      confidence: { overlay: false, level: 'word', cutoff: 0.85, floor: 0.55, sentenceMetric: 'mean' },
    },
  },
  {
    id: 'sentence-review',
    name: 'Sentence review',
    builtIn: true,
    bundle: {
      display: { showSpeakers: true, showTimecodes: true, showTitle: false },
      appearance: { fontSize: 15, lineSpacing: 1.6, highlightOpacity: 0.5 },
      confidence: { overlay: true, level: 'sentence', cutoff: 0.85, floor: 0.55, sentenceMetric: 'mean' },
    },
  },
];

/** Validate/upgrade a persisted root. Returns null when unusable (=> fall back to defaults). */
export const migrate = (persisted) => {
  if (!persisted || typeof persisted !== 'object') return null;
  if (persisted.schemaVersion !== SCHEMA_VERSION) return null; // future: branch & upgrade
  if (!persisted.settings || typeof persisted.settings !== 'object') return null;
  return persisted;
};
